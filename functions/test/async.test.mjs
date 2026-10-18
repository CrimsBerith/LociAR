import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { chunks, firstResultSequential, forEachSequential, readPages } from '../lib/async.js';
import { scalarText } from '../lib/values.js';

test('ordered work never overlaps, stops at failure and leaves no later work running', async () => {
  const visited = [];
  let active = false;
  await assert.rejects(forEachSequential([1, 2, 3], async item => {
    assert.equal(active, false);
    active = true;
    await setImmediate();
    visited.push(item);
    active = false;
    if (item === 2) throw new Error('stop');
  }), /stop/);
  await setImmediate();
  assert.deepEqual(visited, [1, 2]);
  assert.equal(active, false);
});

test('first-result reads never start I/O after finding a value, including false or zero', async () => {
  for (const result of [false, 0, 'found']) {
    const visited = [];
    const found = await firstResultSequential([1, 2, 3], async item => {
      visited.push(item);
      return item === 2 ? result : undefined;
    });
    assert.equal(found, result);
    assert.deepEqual(visited, [1, 2]);
  }
});

test('pagination is lazy, preserves cursor order and stops reading when its consumer breaks', async () => {
  const reads = [];
  const pages = readPages(async cursor => {
    reads.push(cursor);
    return { value: cursor ?? 0, next: (cursor ?? 0) + 1 };
  });
  assert.deepEqual(reads, []);
  for await (const value of pages) {
    assert.equal(value, 0);
    break;
  }
  assert.deepEqual(reads, [undefined]);
  const complete = [];
  for await (const value of readPages(async cursor => ({ value: cursor ?? 0, next: cursor === 1 ? undefined : 1 }))) complete.push(value);
  assert.deepEqual(complete, [0, 1]);
});

test('chunks reject invalid bounds and do not mutate their input', () => {
  const input = Object.freeze([1, 2, 3]);
  assert.deepEqual(chunks(input, 2), [[1, 2], [3]]);
  assert.throws(() => chunks(input, 0), RangeError);
});

test('scalar display never invokes object coercion or exposes object contents', () => {
  assert.equal(scalarText({ toString() { throw new Error('object coercion'); } }), '');
  assert.equal(scalarText(Symbol('private')), '');
  assert.equal(scalarText(null), '');
  assert.equal(scalarText(12), '12');
  assert.equal(scalarText(false), 'false');
});
