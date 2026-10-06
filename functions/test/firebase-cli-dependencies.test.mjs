import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

// Exercise the dependencies resolved by the locked CLI, including a possible
// nested installation. Pub/Sub uses only W3CTraceContextPropagator from core.
const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('firebase-tools/package.json'));
const pubsubRequire = createRequire(cliRequire.resolve('@google-cloud/pubsub/package.json'));
const api = pubsubRequire('@opentelemetry/api');
const { W3CTraceContextPropagator, W3CBaggagePropagator } = pubsubRequire('@opentelemetry/core');
const telemetry = pubsubRequire('./build/src/telemetry-tracing.js');
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';

test('the CLI Pub/Sub consumer preserves W3C trace context with patched core', () => {
  telemetry.setGloballyEnabled(true);
  try {
    for (const traceFlags of [0, 1]) {
      const spanContext = { traceId, spanId, traceFlags, traceState: api.createTraceState('vendor=opaque') };
      const span = { spanContext: () => spanContext };
      const sent = { attributes: { application: 'preserved' } };
      telemetry.injectSpan(span, sent);
      assert.equal(sent.attributes.googclient_traceparent, `00-${traceId}-${spanId}-0${traceFlags}`);
      assert.equal(sent.attributes.googclient_tracestate, 'vendor=opaque');
      assert.equal(sent.attributes.application, 'preserved');
      // Transport carries attributes, never the in-memory parentSpan shortcut.
      const received = { attributes: { ...sent.attributes } };
      const extracted = new W3CTraceContextPropagator().extract(api.ROOT_CONTEXT, received, telemetry.pubsubGetter);
      const parent = api.trace.getSpanContext(extracted);
      assert.equal(parent.traceId, traceId);
      assert.equal(parent.spanId, spanId);
      assert.equal(parent.traceFlags, traceFlags);
      assert.equal(parent.isRemote, true);
      assert.equal(parent.traceState.serialize(), 'vendor=opaque');
      const receivedSpan = telemetry.extractSpan(received, 'projects/demo-lociar/subscriptions/compat');
      assert.equal(receivedSpan.spanContext().traceId, traceId);
      assert.equal(received.parentSpan, receivedSpan);
    }
  } finally {
    telemetry.setGloballyEnabled(false);
  }
});

test('Pub/Sub trace propagation rejects malformed parents and respects disabled telemetry', () => {
  const propagator = new W3CTraceContextPropagator();
  for (const value of ['', 'malformed', `00-${'0'.repeat(32)}-${spanId}-01`, `00-${traceId}-${'0'.repeat(16)}-01`]) {
    const extracted = propagator.extract(api.ROOT_CONTEXT, { attributes: { googclient_traceparent: value } }, telemetry.pubsubGetter);
    assert.equal(api.trace.getSpanContext(extracted), undefined);
  }
  telemetry.setGloballyEnabled(false);
  const message = { attributes: { application: 'preserved' } };
  telemetry.injectSpan({ spanContext() { throw new Error('Disabled telemetry must not read the span'); } }, message);
  assert.deepEqual(message, { attributes: { application: 'preserved' } });
  assert.equal(telemetry.extractSpan(message, 'projects/demo-lociar/subscriptions/compat'), undefined);
});

test('patched baggage propagation bounds untrusted entries, including multiple headers', () => {
  const propagator = new W3CBaggagePropagator();
  const entries = Array.from({ length: 1000 }, (_, i) => `key${i}=value`);
  for (const baggage of [entries.join(','), [entries.slice(0, 100).join(','), entries.slice(100).join(',')]]) {
    const context = propagator.extract(api.ROOT_CONTEXT, { baggage }, api.defaultTextMapGetter);
    assert.equal(api.propagation.getBaggage(context).getAllEntries().length, 180);
  }
  const oversized = propagator.extract(api.ROOT_CONTEXT, { baggage: `large=${'x'.repeat(4097)},safe=kept` }, api.defaultTextMapGetter);
  assert.deepEqual(api.propagation.getBaggage(oversized).getAllEntries(), [['safe', { value: 'kept' }]]);
  const huge = Array.from({ length: 8 }, (_, i) => `key${i}=${'x'.repeat(3000)}`);
  const bounded = propagator.extract(api.ROOT_CONTEXT, { baggage: huge }, api.defaultTextMapGetter);
  assert.equal(api.propagation.getBaggage(bounded).getAllEntries().length, 2);
});

// package.json overrides the CLI's chokidar 3 (braces GHSA-vfj7-8cjw-p6xm) with 4.x. The functions
// emulator watches the source directory with these ignore rules (firebase-tools
// lib/emulator/functionsEmulator.js). 4.x reads the `**/` strings from firebase.json literally, so
// src/test edits also reload triggers; the regex rules below must still keep dependencies, dotfiles
// (.secret.local, .env.*) and logs out of the watch.
test('the CLI file watcher (chokidar 4) keeps the emulator ignore rules', async () => {
  const chokidar = cliRequire('chokidar');
  const manifest = JSON.parse(readFileSync(join(dirname(cliRequire.resolve('chokidar')), 'package.json'), 'utf8'));
  assert.equal(manifest.version.split('.')[0], '4');
  const root = mkdtempSync(join(tmpdir(), 'lociar-watch-'));
  try {
    mkdirSync(join(root, 'lib'));
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    for (const file of ['lib/index.js', 'node_modules/pkg/index.js', '.secret.local', 'firebase-debug.log']) {
      writeFileSync(join(root, file), '');
    }
    const watcher = chokidar.watch(root, {
      ignored: [
        /(^|[\/\\])\../,
        /.+\.log/,
        /.+?[\\\/]node_modules[\\\/].+?/,
        /.+?[\\\/]venv[\\\/].+?/,
        ...['node_modules', '.git', '*.local', 'src', 'test', 'tsconfig.json'].map((i) => `**/${i}`),
      ],
      persistent: true,
    });
    await new Promise((resolve, reject) => watcher.on('ready', resolve).on('error', reject));
    const watched = watcher.getWatched();
    await watcher.close();
    assert.deepEqual(watched[join(root, 'lib')], ['index.js']);
    assert.deepEqual(watched[join(root, 'node_modules')] ?? [], [], 'dependencies are not watched');
    assert.equal(watched[join(root, 'node_modules', 'pkg')], undefined);
    assert.ok(!watched[root].includes('.secret.local'), 'dotfiles are not watched');
    assert.ok(!watched[root].includes('firebase-debug.log'), 'logs are not watched');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
