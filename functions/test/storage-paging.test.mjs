import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePagedStorageFiles, STORAGE_DELETE_CONCURRENCY } from '../lib/storagePaging.js';

test('large prefixes are paged and deletion concurrency remains bounded', async () => {
  let live = 0, peak = 0, deleted = 0; const cursors = [];
  const count = await deletePagedStorageFiles(async cursor => {
    cursors.push(cursor); const page = Number(cursor ?? 0);
    return { files: Array.from({ length: 100 }, () => ({ delete: async options => {
      assert.equal(options.ignoreNotFound, true); peak = Math.max(peak, ++live);
      await new Promise(resolve => setImmediate(resolve)); live--; deleted++;
    } })), nextPageToken: page < 12 ? String(page + 1) : undefined };
  });
  assert.equal(count, 1300); assert.equal(deleted, 1300); assert.equal(cursors.length, 13);
  assert.equal(live, 0); assert.ok(peak <= STORAGE_DELETE_CONCURRENCY);
});

test('a partial failure drains outstanding work before returning and leaves the rest retryable', async () => {
  let live = 0, attempts = 0; const remaining = new Set(Array.from({ length: 31 }, (_, i) => i)); let fail = true;
  const readPage = async () => ({ files: [...remaining].map(id => ({ delete: async () => {
    live++; attempts++; await new Promise(resolve => setImmediate(resolve)); live--;
    if (id === 3 && fail) throw new Error('synthetic outage'); remaining.delete(id);
  } })) });
  await assert.rejects(deletePagedStorageFiles(readPage), /synthetic outage/);
  assert.equal(live, 0); assert.equal(attempts, 10); assert.equal(remaining.size, 22);
  fail = false; assert.equal(await deletePagedStorageFiles(readPage), 22); assert.equal(remaining.size, 0);
});

test('an empty intermediate page can advance, while a repeated cursor fails instead of spinning', async () => {
  let calls = 0;
  assert.equal(await deletePagedStorageFiles(async cursor => { calls++; return { files: [], nextPageToken: cursor ? undefined : 'next' }; }), 0);
  assert.equal(calls, 2);
  await assert.rejects(deletePagedStorageFiles(async () => ({ files: [], nextPageToken: 'stuck' })), /did not advance/);
});
