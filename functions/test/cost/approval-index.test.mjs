import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db, Timestamp } = await import('../../lib/core.js');
const { autoApproveNote, indexNotificationLike, MIN_LIKER_AGE_MS } = await import('../../lib/noteAutomation.js');
after(async () => { await deleteApp(getApp()); });

async function fixture(count, age, indexed = true, createLikes = true) {
  const now = Date.now(), post = db.collection('posts').doc(randomUUID()), author = randomUUID();
  const created = Timestamp.fromMillis(now - age), eligible = Timestamp.fromMillis(now - age + MIN_LIKER_AGE_MS);
  const users = Array.from({ length: count }, () => randomUUID()), batch = db.batch();
  batch.set(post, { creator_id: author, note_kind: 'location', status: 'active', visibility: 'public', push_state: 'none', likes_count: count });
  users.forEach(user => {
    batch.set(db.collection('profiles').doc(user), { created_at: created });
    if (createLikes) batch.set(db.collection('likes').doc(`${post.id}_${user}`), { post_id: post.id, user_id: user, ...(indexed ? { notification_eligible_at: eligible } : {}) });
  });
  await batch.commit();
  await db.collection('system').doc('place_notes').set({ approval_index_version: indexed ? 1 : 0, push_like_threshold: 3 });
  return { now, post, users };
}

test('server index hint is idempotent, cannot resurrect an unlike, and rereads a recreated edge', async () => {
  const f = await fixture(1, 0, false), edge = db.collection('likes').doc(`${f.post.id}_${f.users[0]}`);
  assert.deepEqual(await indexNotificationLike(edge, false), { eligible: true, indexed: false });
  assert.deepEqual(await indexNotificationLike(edge), { eligible: true, indexed: true });
  const first = await edge.get();
  await indexNotificationLike(edge);
  assert.equal((await edge.get()).updateTime.isEqual(first.updateTime), true, 'no repeat write');
  await edge.delete();
  assert.deepEqual(await indexNotificationLike(edge), { eligible: false, indexed: false });
  assert.equal((await edge.get()).exists, false);
  await edge.set({ post_id: f.post.id, user_id: f.users[0] });
  await indexNotificationLike(edge);
  assert.ok((await edge.get()).get('notification_eligible_at') instanceof Timestamp);
});

test('growing young likes do not hydrate old likes/profiles in indexed mode; age transition still approves', async t => {
  const f = await fixture(199, 0, true, false);
  let documentReads = 0, queryReads = 0, queryRows = 0;
  const run = db.runTransaction.bind(db);
  t.mock.method(db, 'runTransaction', (update, ...options) => run(async tx => {
    const counted = {
      get: async ref => {
        const result = await tx.get(ref);
        if (Array.isArray(result.docs)) { queryReads++; queryRows += result.size; }
        else documentReads++;
        return result;
      },
      getAll: async (...refs) => { documentReads += refs.length; return tx.getAll(...refs); },
      update: tx.update.bind(tx), set: tx.set.bind(tx), create: tx.create.bind(tx), delete: tx.delete.bind(tx),
    };
    return update(counted);
  }, ...options));
  let inserted = 0;
  for (let count = 3; count <= 199; count++) {
    while (inserted < count) {
      const user = f.users[inserted++];
      await db.collection('likes').doc(`${f.post.id}_${user}`).set({ post_id: f.post.id, user_id: user,
        notification_eligible_at: Timestamp.fromMillis(f.now + MIN_LIKER_AGE_MS) });
    }
    await f.post.update({ likes_count: count });
    assert.equal(await autoApproveNote(f.post.id, f.now), false);
  }
  assert.equal(documentReads, 394); assert.equal(queryReads, 197); assert.equal(queryRows, 0);
  t.mock.restoreAll();
  assert.equal(await autoApproveNote(f.post.id, f.now + MIN_LIKER_AGE_MS + 1), true);
});

test('query hints never replace fresh age, suspension or permanent deletion checks', async () => {
  const f = await fixture(3, MIN_LIKER_AGE_MS + 1000);
  const profile = db.collection('profiles').doc(f.users[0]), fence = db.collection('account_deletion_jobs').doc(f.users[0]);
  await profile.update({ created_at: Timestamp.fromMillis(f.now) });
  assert.equal(await autoApproveNote(f.post.id, f.now), false, 'a forged/stale mature hint cannot approve a young account');
  await profile.update({ created_at: Timestamp.fromMillis(f.now - MIN_LIKER_AGE_MS - 1000), suspended: true });
  assert.equal(await autoApproveNote(f.post.id, f.now), false);
  await profile.update({ suspended: false }); await fence.set({ status: 'pending' });
  assert.equal(await autoApproveNote(f.post.id, f.now), false);
  await fence.delete();
  assert.equal(await autoApproveNote(f.post.id, f.now), true);
});

test('legacy mode stays complete before activation and indexed pages support thresholds above 200', async () => {
  const legacy = await fixture(3, MIN_LIKER_AGE_MS + 1000, false);
  assert.equal(await autoApproveNote(legacy.post.id), true, 'no migration flag means legacy rows remain readable to the server');
  const f = await fixture(201, MIN_LIKER_AGE_MS + 1000);
  await db.collection('system').doc('place_notes').update({ push_like_threshold: 201 });
  const fence = db.collection('account_deletion_jobs').doc(f.users[0]); await fence.set({ status: 'pending' });
  assert.equal(await autoApproveNote(f.post.id), false);
  await fence.delete(); assert.equal(await autoApproveNote(f.post.id), true);
});
