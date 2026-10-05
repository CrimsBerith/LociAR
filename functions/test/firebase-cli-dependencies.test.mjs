import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
