import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const declared = {};
for (const match of indexSource.matchAll(/export\s*\{([^}]*)\}\s*from\s*'(\.\/[^']+)'/g)) {
  for (const name of match[1].split(',').map(part => part.trim()).filter(Boolean)) declared[name] = match[2];
}

function load(target) {
  // A fresh process per case: the entry decides what to load at require time.
  const env = { ...process.env, GCLOUD_PROJECT: 'demo-lociar', FIREBASE_CONFIG: '{"projectId":"demo-lociar"}' };
  if (target) env.FUNCTION_TARGET = target; else delete env.FUNCTION_TARGET;
  const lib = fileURLToPath(new URL('../lib/', import.meta.url));
  const script = `const m = require(${JSON.stringify(lib + 'entry.js')});
    const loaded = Object.keys(require.cache).filter(p => p.startsWith(${JSON.stringify(lib)})).map(p => p.slice(${JSON.stringify(lib)}.length));
    process.stdout.write(JSON.stringify({ exports: Object.keys(m).sort(), loaded }));`;
  const run = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('the entry map lists exactly the functions exported by index.ts', async () => {
  const { FUNCTION_MODULES } = await import('../lib/functionModules.js');
  assert.deepEqual({ ...FUNCTION_MODULES }, declared);
});

test('without FUNCTION_TARGET (CLI discovery, emulator) every function is exported', () => {
  const { exports } = load(null);
  assert.deepEqual(exports, Object.keys(declared).sort());
});

test('a known FUNCTION_TARGET exports only that function and skips unrelated modules', () => {
  const { exports, loaded } = load('getGifConfig');
  assert.deepEqual(exports, ['getGifConfig']);
  for (const heavy of ['supportStripe.js', 'supportApple.js', 'avatar.js', 'index.js']) assert.ok(!loaded.includes(heavy), `${heavy} loaded`);
});

test('an unknown FUNCTION_TARGET falls back to loading everything', () => {
  const { exports } = load('notAFunction');
  assert.equal(exports.length, Object.keys(declared).length);
});
