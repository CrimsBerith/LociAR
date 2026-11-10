import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-lociar', storageBucket: 'demo-lociar.appspot.com' });
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { moderatePost } = await import('../../lib/ops.ts');
const require = createRequire(new URL('../../../functions/package.json', import.meta.url));
const core = require('./lib/core.js');
const { purgeDueRemovedMedia, schedulePurgeOnStatusChange } = require('./lib/cleanup.js');
const db = adminDb();
after(async () => {
  await core.db.terminate();
  await Promise.all(getApps().map(deleteApp));
});
async function fixture() {
  const author = randomUUID(), post = db.collection('posts').doc(randomUUID());
  await db.collection('profiles').doc(author).set({ deleted_at: null });
  await post.set({ creator_id: author, status: 'removed', deleted_at: Timestamp.now(), deleted_by: 'test-admin',
    age_rating: 'all', visibility: 'public' });
  const queue = db.collection('media_purge_queue').doc(post.id);
  await queue.set({ post_id: post.id, prefix: `${author}/${post.id}/`, due_at: Timestamp.fromMillis(1) });
  return { post, queue, author };
}

test('an admin cannot restore a post during external media deletion; restoration works after completion', async () => {
  const f = await fixture(), originalDelete = core.deleteStoragePrefix;
  let restoredDuringDelete = false, deletes = 0;
  core.deleteStoragePrefix = async () => {
    try { await moderatePost(f.post.id, 'restore', 'test-admin', 'Cleanup race regression', randomUUID()); restoredDuringDelete = true; }
    catch (error) { assert.match(error.message, /post_media_cleanup_in_progress/); }
    deletes++; return 1;
  };
  try {
    await purgeDueRemovedMedia();
    assert.equal(restoredDuringDelete, false, 'restored AR content must not lose its files in flight');
    assert.equal(deletes, 1);
    assert.ok((await f.post.get()).get('media_purged_at'));
    await moderatePost(f.post.id, 'restore', 'test-admin', 'Cleanup race regression', randomUUID());
    assert.equal((await f.post.get()).get('status'), 'pending_review');
  } finally { core.deleteStoragePrefix = originalDelete; await f.queue.delete(); }
});

test('a stale due-query snapshot cannot consume a replacement grace-period queue', async () => {
  const f = await fixture(), originalCollection = core.db.collection, originalDelete = core.deleteStoragePrefix;
  let intercepted = false, deletes = 0;
  const future = Date.now() + 30 * 86_400_000;
  const wrap = query => new Proxy(query, {
    get(target, key) {
      if (key === 'get') return async () => {
        const page = await target.get();
        if (!intercepted) {
          intercepted = true;
          await f.queue.set({ post_id: f.post.id, prefix: `${f.author}/${f.post.id}/`, due_at: Timestamp.fromMillis(future) });
        }
        return page;
      };
      if (['where', 'limit', 'orderBy'].includes(key)) return (...args) => wrap(target[key](...args));
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    },
  });
  core.db.collection = function(path) {
    const collection = originalCollection.call(this, path);
    return path === 'media_purge_queue' ? wrap(collection) : collection;
  };
  core.deleteStoragePrefix = async () => { deletes++; return 1; };
  try {
    await purgeDueRemovedMedia();
    assert.equal(deletes, 0, 'current queue deadline must be rechecked before deletion');
    assert.equal((await f.queue.get()).get('due_at').toMillis(), future);
  } finally { core.db.collection = originalCollection; core.deleteStoragePrefix = originalDelete; await f.queue.delete(); }
});

test('concurrent cleaners acquire one external deletion lease', async () => {
  const f = await fixture(), originalDelete = core.deleteStoragePrefix;
  let started, release, deletes = 0;
  const began = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  core.deleteStoragePrefix = async () => { deletes++; started(); await gate; return 1; };
  const first = purgeDueRemovedMedia();
  try {
    await began;
    assert.equal(await purgeDueRemovedMedia(), 0);
    assert.equal(deletes, 1);
    release(); assert.equal(await first, 1);
  } finally { release(); await first; core.deleteStoragePrefix = originalDelete; await f.queue.delete(); }
});

test('late status events retain a purge lease; failures resume and do not leave restoration permanently blocked', async () => {
  const f = await fixture(), healthy = await fixture(), originalDelete = core.deleteStoragePrefix;
  await healthy.queue.update({ due_at: Timestamp.fromMillis(2) });
  let leasePreserved = false;
  core.deleteStoragePrefix = async prefix => {
    if (prefix !== `${f.author}/${f.post.id}/`) return 1;
    const claimed = (await f.queue.get()).get('claim_id');
    await schedulePurgeOnStatusChange(f.post.id, { status: 'active' }, { status: 'removed' });
    leasePreserved = Boolean(claimed) && (await f.queue.get()).get('claim_id') === claimed;
    throw new Error('synthetic transient storage error');
  };
  try {
    assert.equal(await purgeDueRemovedMedia(), 1, 'one failing job cannot stop the later healthy job');
    assert.equal((await healthy.queue.get()).exists, false);
    assert.equal(leasePreserved, true, 'late events cannot steal the worker lease');
    assert.equal((await f.post.get()).get('media_purge_state'), 'purging');
    assert.equal((await f.queue.get()).get('claim_id'), undefined);
    await assert.rejects(moderatePost(f.post.id, 'restore', 'test-admin', 'Cleanup retry regression', randomUUID()), /post_media_cleanup_in_progress/);
    core.deleteStoragePrefix = async () => 1;
    assert.equal(await purgeDueRemovedMedia(Date.now() + 16 * 60_000), 1);
    assert.equal((await f.queue.get()).exists, false);
    await moderatePost(f.post.id, 'restore', 'test-admin', 'Cleanup retry regression', randomUUID());
    assert.equal((await f.post.get()).get('status'), 'pending_review');
  } finally { core.deleteStoragePrefix = originalDelete; await f.queue.delete(); await healthy.queue.delete(); }
});

test('rapid restore and re-removal atomically start a new grace period before delayed status triggers', async () => {
  const f = await fixture(), originalDelete = core.deleteStoragePrefix;
  let deletes = 0;
  core.deleteStoragePrefix = async () => { deletes++; return 1; };
  try {
    await moderatePost(f.post.id, 'restore', 'test-admin', 'Cleanup lifecycle regression', randomUUID());
    assert.equal((await f.queue.get()).exists, false, 'restoration cancels the old deadline in the same transaction');
    const started = Date.now();
    await moderatePost(f.post.id, 'soft_delete', 'test-admin', 'Cleanup lifecycle regression', randomUUID());
    const deadline = (await f.queue.get()).get('due_at').toMillis();
    assert.ok(deadline >= started + 30 * 86_400_000);
    await schedulePurgeOnStatusChange(f.post.id, { status: 'removed' }, { status: 'pending_review' });
    assert.equal((await f.queue.get()).get('due_at').toMillis(), deadline);
    await purgeDueRemovedMedia(); assert.equal(deletes, 0);
  } finally { core.deleteStoragePrefix = originalDelete; await f.queue.delete(); }
});
