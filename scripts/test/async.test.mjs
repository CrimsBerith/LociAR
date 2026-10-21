import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachSequential, pollUntil, readPages } from '../async.mjs';

test('polling stops after success or its attempt budget, without scheduling later reads', async () => {
  let attempts = 0;
  assert.equal(await pollUntil(async () => ++attempts, value => value === 2, 4, 0, 'timeout'), 2);
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(pollUntil(async () => ++attempts, () => false, 3, 0, 'timeout'), /timeout/);
  assert.equal(attempts, 3);
});

test('script sequencing stops at rejection and leaves later commands unstarted', async () => {
  const started = [];
  await assert.rejects(forEachSequential([1, 2, 3], async value => {
    started.push(value);
    if (value === 2) throw new Error('failed command');
  }), /failed command/);
  assert.deepEqual(started, [1, 2]);
});

test('script page readers do not fetch after a consumer breaks', async () => {
  let count = 0;
  for await (const value of readPages(async () => ({ value: ++count, next: count }))) {
    assert.equal(value, 1);
    break;
  }
  assert.equal(count, 1);
});
