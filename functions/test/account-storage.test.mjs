import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccountStorage } from '../lib/accountStorage.js';

test('large account Storage deletion stays paged and bounded while deleting across changing pages', async () => {
  const owner = '11111111-1111-5111-8111-111111111111';
  const names = new Set(Array.from({ length: 701 }, (_, i) => `post-world-maps/${owner}/draft/${i}.lociarmap`));
  names.add('avatars/other-owner/current/keep.jpg');
  let inflight = 0;
  let maximum = 0;
  let mapPages = 0;
  const removed = await deleteAccountStorage(`${owner}/`, () => {}, {
    async list(prefix, limit) {
      assert.equal(limit, 300);
      if (prefix.startsWith('post-world-maps/')) mapPages++;
      return [...names].filter(name => name.startsWith(prefix)).slice(0, limit).map(name => ({
        name, async delete() {
          inflight++; maximum = Math.max(maximum, inflight);
          await new Promise(resolve => setImmediate(resolve));
          names.delete(name); inflight--;
        },
      }));
    },
  });
  assert.equal(removed, 701);
  assert.equal(mapPages, 3);
  assert.equal(maximum, 10);
  assert.deepEqual([...names], ['avatars/other-owner/current/keep.jpg']);
});

test('a permanent Storage deletion failure is propagated and a later invocation clears surviving objects', async () => {
  const names = new Set(['avatars/owner/current/a.jpg', 'avatars/owner/current/b.jpg']);
  let fail = true;
  const io = {
    async list(prefix) {
      return [...names].filter(name => name.startsWith(prefix)).map(name => ({
        name, async delete() {
          if (fail && name.endsWith('b.jpg')) throw new Error('synthetic Storage failure');
          names.delete(name);
        },
      }));
    },
  };
  await assert.rejects(deleteAccountStorage('owner/', () => {}, io), /Storage failure/);
  assert.equal(names.has('avatars/owner/current/b.jpg'), true);
  fail = false;
  assert.equal(await deleteAccountStorage('owner/', () => {}, io), 1);
  assert.equal(names.size, 0);
});

test('budget exhaustion and a mismatched Storage listing stop before unsafe deletes', async () => {
  let listings = 0;
  await assert.rejects(deleteAccountStorage('owner/', () => { throw new Error('budget exhausted'); }, {
    async list() { listings++; return []; },
  }), /budget exhausted/);
  assert.equal(listings, 0);
  let deletes = 0;
  await assert.rejects(deleteAccountStorage('owner/', () => {}, {
    async list() { return [{ name: 'avatars/other-owner/file.jpg', async delete() { deletes++; } }]; },
  }), /Unexpected Storage prefix/);
  assert.equal(deletes, 0);
});
