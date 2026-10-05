import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients } from './_harness.mjs';
import { onFollowCreated, onFollowDeleted, onLikeCreated, onLikeDeleted,
  onSaveCreated, onSaveDeleted, onCommentCreated, onCommentDeleted, onPostWritten } from '../../lib/triggers.js';
import { reconcileCounters, reconcileProfileCounters } from '../../lib/reconciliation.js';
import { applyCountersOnce } from '../../lib/counters.js';

after(closeClients);
const dataEvent = (data, id = randomUUID()) => ({ id: `counter-${id}`, data: { data: () => data } });
const postEvent = (postId, before, after, id = randomUUID()) => ({ id: `counter-post-${id}`, params: { postId },
  data: { before: { data: () => before }, after: { data: () => after } } });
const profile = async () => {
  const ref = adminDb.collection('profiles').doc(randomUUID());
  await ref.set({ follower_count: 0, following_count: 0, public_post_count: 0 }); return ref;
};
const post = async (extra = {}) => {
  const ref = adminDb.collection('posts').doc(randomUUID());
  await ref.set({ creator_id: randomUUID(), status: 'active', visibility: 'public', views_count: 7,
    likes_count: 0, comments_count: 0, saves_count: 0, engagement_score: 7, ...extra }); return ref;
};

test('follow delete delivered before create and redelivered concurrently stays at zero', async () => {
  const a = await profile(); const b = await profile();
  const row = { follower_id: a.id, following_id: b.id }; // Source row was already removed.
  const deleted = dataEvent(row); const created = dataEvent(row);
  await onFollowDeleted.run(deleted); await onFollowCreated.run(created);
  await Promise.all([onFollowCreated.run(created), onFollowDeleted.run(deleted)]);
  assert.equal((await a.get()).get('following_count'), 0);
  assert.equal((await b.get()).get('follower_count'), 0);
});

test('follow rapid re-create ignores old create/delete deliveries and keeps one current relation', async () => {
  const a = await profile(); const b = await profile(); const row = { follower_id: a.id, following_id: b.id };
  await adminDb.collection('follows').doc(`${a.id}_${b.id}`).set(row);
  await Promise.all([onFollowCreated.run(dataEvent(row)), onFollowDeleted.run(dataEvent(row)), onFollowCreated.run(dataEvent(row))]);
  assert.equal((await a.get()).get('following_count'), 1);
  assert.equal((await b.get()).get('follower_count'), 1);
});

test('like reverse delivery preserves real views and the matching engagement score', async () => {
  const target = await post(); const row = { post_id: target.id, user_id: randomUUID() };
  await onLikeDeleted.run(dataEvent(row)); await onLikeCreated.run(dataEvent(row));
  assert.equal((await target.get()).get('likes_count'), 0);
  assert.equal((await target.get()).get('engagement_score'), 7);
  await adminDb.collection('likes').doc(`${target.id}_${row.user_id}`).set(row);
  await Promise.all([onLikeDeleted.run(dataEvent(row)), onLikeCreated.run(dataEvent(row)), onLikeCreated.run(dataEvent(row))]);
  assert.equal((await target.get()).get('likes_count'), 1);
  assert.equal((await target.get()).get('engagement_score'), 10);
});

test('save reverse delivery and later re-create use the current source row', async () => {
  const target = await post(); const row = { post_id: target.id, user_id: randomUUID() };
  await onSaveDeleted.run(dataEvent(row)); await onSaveCreated.run(dataEvent(row));
  assert.equal((await target.get()).get('saves_count'), 0);
  await adminDb.collection('post_saves').doc(`${target.id}_${row.user_id}`).set(row);
  await onSaveDeleted.run(dataEvent(row));
  assert.equal((await target.get()).get('saves_count'), 1);
});

test('filtered delete repairs a comment counted by a concurrent valid-comment create', async () => {
  const target = await post();
  const good = adminDb.collection('comments').doc(randomUUID()); const bad = adminDb.collection('comments').doc(randomUUID());
  const goodRow = { post_id: target.id, user_id: randomUUID(), text: 'Allowed' };
  const badRow = { post_id: target.id, user_id: randomUUID(), text: 'siktir git' };
  await Promise.all([good.set(goodRow), bad.set(badRow)]);
  await onCommentCreated.run({ ...dataEvent(goodRow), data: { id: good.id, ref: good, data: () => goodRow } });
  // The bad source row may be temporarily visible before its moderation delivery runs.
  await onCommentCreated.run({ ...dataEvent(badRow), data: { id: bad.id, ref: bad, data: () => badRow } });
  await onCommentDeleted.run({ ...dataEvent(badRow), params: { id: bad.id } });
  assert.equal((await target.get()).get('comments_count'), 1);
  assert.equal((await target.get()).get('engagement_score'), 12);
  assert.equal((await bad.get()).exists, false);
});

test('public-post reverse status deliveries and creator transfer recount both profiles', async () => {
  const a = await profile(); const b = await profile();
  const target = await post({ creator_id: a.id, status: 'removed' });
  const active = { creator_id: a.id, status: 'active', visibility: 'public' };
  const removed = { ...active, status: 'removed' };
  await onPostWritten.run(postEvent(target.id, active, removed));
  await onPostWritten.run(postEvent(target.id, undefined, active));
  assert.equal((await a.get()).get('public_post_count'), 0);
  await target.update({ creator_id: b.id, status: 'active' });
  await onPostWritten.run(postEvent(target.id, active, { ...active, creator_id: b.id }));
  assert.equal((await a.get()).get('public_post_count'), 0);
  assert.equal((await b.get()).get('public_post_count'), 1);
});

test('nightly post repair recomputes engagement, retains signed manual offsets and preserves proven legacy edits', async () => {
  const prefix = `zzcounter-${randomUUID()}`;
  const plain = adminDb.collection('posts').doc(`${prefix}-1`);
  const adjusted = adminDb.collection('posts').doc(`${prefix}-2`);
  const legacy = adminDb.collection('posts').doc(`${prefix}-3`);
  const defaults = { creator_id: randomUUID(), views_count: 7, likes_count: 99, comments_count: 99, saves_count: 99, engagement_score: 999 };
  await plain.set(defaults); await adjusted.set({ ...defaults, metrics_admin_edited_by: 'test-admin', metrics_counter_offsets: { likes_count: 4, comments_count: -1 } });
  await legacy.set({ ...defaults, likes_count: 12, comments_count: 13, metrics_admin_edited_at: new Date() });
  for (const ref of [plain, adjusted, legacy]) {
    await adminDb.collection('likes').doc(randomUUID()).set({ post_id: ref.id, user_id: randomUUID() });
    await adminDb.collection('comments').doc(randomUUID()).set({ post_id: ref.id, user_id: randomUUID(), text: 'Allowed' });
  }
  await adminDb.collection('system').doc('counter_reconciliation_posts').set({ last_id: `${prefix}-0` });
  await reconcileCounters(3);
  assert.equal((await plain.get()).get('likes_count'), 1);
  assert.equal((await plain.get()).get('comments_count'), 1);
  assert.equal((await plain.get()).get('saves_count'), 0);
  assert.equal((await plain.get()).get('engagement_score'), 15);
  assert.equal((await adjusted.get()).get('likes_count'), 5);
  assert.equal((await adjusted.get()).get('comments_count'), 0);
  assert.equal((await adjusted.get()).get('engagement_score'), 22);
  assert.equal((await legacy.get()).get('likes_count'), 12);
  assert.equal((await legacy.get()).get('comments_count'), 13);
  assert.equal((await legacy.get()).get('engagement_score'), 108);
  // A pending delivery after repair must recount, rather than add an already included row.
  await onLikeCreated.run(dataEvent({ post_id: plain.id, user_id: randomUUID() }));
  assert.equal((await plain.get()).get('likes_count'), 1);
});

test('nightly profile repair reaches follow and public-post counts without including hidden posts', async () => {
  const prefix = `zzcounter-profile-${randomUUID()}`;
  const a = adminDb.collection('profiles').doc(`${prefix}-1`); const b = adminDb.collection('profiles').doc(`${prefix}-2`);
  await Promise.all([a.set({ following_count: 20, follower_count: 20, public_post_count: 20 }), b.set({ following_count: 20, follower_count: 20, public_post_count: 20 })]);
  await adminDb.collection('follows').doc(randomUUID()).set({ follower_id: a.id, following_id: b.id });
  await post({ creator_id: a.id }); await post({ creator_id: a.id, deleted_at: new Date() });
  await post({ creator_id: a.id, age_rating: '18_plus' }); await post({ creator_id: a.id, visibility: 'private' });
  await adminDb.collection('system').doc('counter_reconciliation_profiles').set({ last_id: `${prefix}-0` });
  await reconcileProfileCounters(2);
  assert.equal((await a.get()).get('following_count'), 1);
  assert.equal((await a.get()).get('follower_count'), 0);
  assert.equal((await a.get()).get('public_post_count'), 1);
  assert.equal((await b.get()).get('follower_count'), 1);
  assert.equal((await b.get()).get('public_post_count'), 0);
});

test('a missing counter target is never recreated and expired receipts remain harmless', async () => {
  const target = await post(); const row = { post_id: target.id, user_id: randomUUID() }; const event = dataEvent(row);
  await adminDb.collection('likes').doc(randomUUID()).set(row);
  await onLikeCreated.run(event); await adminDb.collection('trigger_receipts').doc(event.id).delete();
  await onLikeCreated.run(event);
  assert.equal((await target.get()).get('likes_count'), 1);
  await target.delete(); await onLikeCreated.run(dataEvent(row));
  assert.equal((await target.get()).exists, false);
});

test('late social events cannot recreate activity for an account with a deletion fence', async () => {
  const a = await profile(); const b = await profile();
  await adminDb.collection('account_deletion_jobs').doc(a.id).set({ status: 'complete' });
  const row = { follower_id: a.id, following_id: b.id };
  await onFollowCreated.run(dataEvent(row));
  assert.equal((await adminDb.collection('activity_events').doc(`follow_${a.id}_${b.id}`).get()).exists, false);
  await a.delete();
  await applyCountersOnce(`missing-profile-${randomUUID()}`, [{ path: a.path, fields: ['following_count'] }]);
  assert.equal((await a.get()).exists, false);
});


test('pending and private post deliveries leave creator profiles unlocked and unchanged', async () => {
  const owner = await profile();
  const initial = await owner.get();
  const events = Array.from({ length: 40 }, (_, i) => {
    const data = { creator_id: owner.id, status: i % 2 ? 'pending_review' : 'active', visibility: i % 2 ? 'public' : 'private' };
    return postEvent(randomUUID(), undefined, data);
  });
  await Promise.all(events.map(event => onPostWritten.run(event)));
  const after = await owner.get();
  assert.equal(after.updateTime.isEqual(initial.updateTime), true, 'non-public writes do not contend on the creator profile');
  for (const event of events) assert.equal((await adminDb.collection('trigger_receipts').doc(event.id).get()).exists, false);
});
