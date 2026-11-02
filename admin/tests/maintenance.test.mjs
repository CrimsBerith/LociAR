import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const names = source => [...source.matchAll(/\{ name: '(\w+)'/g)].map(match => match[1]);

test('the panel lists exactly the maintenance tasks the backend runs, in the same order', () => {
  const panel = names(read('../lib/maintenance.ts'));
  const backend = names(read('../../functions/src/maintenance.ts'));
  assert.ok(panel.length >= 7);
  assert.deepEqual(panel, backend);
});

test('only account deletion retries refuse a pause, on both sides', () => {
  const unpausable = source => [...source.matchAll(/\{ name: '(\w+)'[^}]*?pausable: false/g)].map(match => match[1]);
  assert.deepEqual(unpausable(read('../lib/maintenance.ts')), ['account_deletions']);
  assert.deepEqual(unpausable(read('../../functions/src/maintenance.ts')), ['account_deletions']);
});
