import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'A local Firestore emulator is required');
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { setPostMetrics, decideApproval, postVersion, moderatePost, setUserSuspended, decideAvatar } = await import('../../lib/ops.ts');
const { luidForUid } = await import('../../lib/account-lifecycle.ts');
after(async () => Promise.all(getApps().map(deleteApp)));

async function sourceFixture() {
  const db = adminDb(); const post = db.collection('posts').doc(randomUUID());
  await post.set({ status: 'active', views_count: 4, likes_count: 2, comments_count: 3, engagement_score: 25, updated_at: Timestamp.now() });
  await Promise.all([
    ...Array.from({ length: 2 }, () => db.collection('likes').doc(randomUUID()).set({ post_id: post.id, user_id: randomUUID() })),
    ...Array.from({ length: 3 }, () => db.collection('comments').doc(randomUUID()).set({ post_id: post.id, user_id: randomUUID(), text: 'Allowed' })),
  ]);
  return { db, post };
}

test('direct metric edits persist signed source offsets and accurate audit fields without replay drift', async () => {
  const { db, post } = await sourceFixture(); const key = randomUUID(); const actor = randomUUID();
  await setPostMetrics(post.id, { views: 10, likes: 8, comments: 1 }, actor, 'Reviewed metric correction', key, null);
  const beforeReplay = (await post.get()).data();
  assert.deepEqual(beforeReplay.metrics_counter_offsets, { likes_count: 6, comments_count: -2 });
  assert.equal(beforeReplay.engagement_score, 39);
  const audit = (await db.collection('admin_audit_log').doc(key).get()).get('after_state');
  assert.equal(audit.likes_count, 8); assert.equal(audit.engagement_score, 39);
  assert.deepEqual(audit.metrics_counter_offsets, { likes_count: 6, comments_count: -2 });
  await db.collection('likes').doc(randomUUID()).set({ post_id: post.id, user_id: randomUUID() });
  await assert.rejects(setPostMetrics(post.id, { views: 99, likes: 99, comments: 99 }, actor, 'Replayed correction', key, null), /idempotency_key_reused/);
  await setPostMetrics(post.id, { views: 10, likes: 8, comments: 1 }, actor, 'Reviewed metric correction', key, null);
  assert.deepEqual((await post.get()).data(), beforeReplay);
});

test('approved metric edits use the same source offsets and audit the actual persisted counter fields', async () => {
  const { db, post } = await sourceFixture(); const actor = randomUUID(); const requester = randomUUID();
  const approval = db.collection('admin_approval_requests').doc(randomUUID());
  await approval.set({ action: 'post_metrics_set', resource_type: 'post', resource_id: post.id,
    requested_by: requester, target_version: postVersion((await post.get()).data()),
    payload: { viewsCount: 10, likesCount: 8, commentsCount: 1 }, reason: 'Reviewed metric correction',
    expires_at: Timestamp.fromMillis(Date.now() + 60_000), status: 'pending' });
  await decideApproval(approval.id, 'approved', actor, 'Second reviewer approval', randomUUID());
  const data = (await post.get()).data();
  assert.deepEqual(data.metrics_counter_offsets, { likes_count: 6, comments_count: -2 });
  assert.equal(data.engagement_score, 39);
  const audits = await db.collection('admin_audit_log').where('actor_id', '==', actor).get();
  const audit = audits.docs.find((doc) => doc.get('action') === 'post_metrics_set').get('after_state');
  assert.equal(audit.views_count, 10); assert.equal(audit.likes_count, 8); assert.equal(audit.comments_count, 1);
  assert.equal(audit.engagement_score, 39); assert.equal(audit.likes, undefined);
});


test('deletion fences reject target and actor mutations before metrics, moderation or audit changes', async () => {
  const { db, post } = await sourceFixture(); const target = randomUUID(); const actor = randomUUID();
  await post.update({ creator_id: target });
  await db.collection('profiles').doc(target).set({ suspended: false });
  await db.collection('avatar_reviews').doc(target).set({ status: 'pending', path: 'avatars/test/pending/avatar.jpg' });
  await db.collection('account_deletion_jobs').doc(target).set({ status: 'pending' });
  for (const action of [
    (key) => setPostMetrics(post.id, { views: 10, likes: 8, comments: 1 }, actor, 'Valid review reason', key, null),
    (key) => moderatePost(post.id, 'approve', actor, 'Valid review reason', key),
    (key) => setUserSuspended(target, true, actor, 'Valid review reason', key),
    (key) => decideAvatar(target, 'approve', actor, 'Valid review reason', key),
  ]) {
    const key = randomUUID(); await assert.rejects(action(key), /account_deleting/);
    assert.equal((await db.collection('admin_audit_log').doc(key).get()).exists, false);
  }
  assert.equal((await post.get()).get('likes_count'), 2);
  assert.equal((await db.collection('profiles').doc(target).get()).get('suspended'), false);
  assert.equal((await db.collection('avatar_reviews').doc(target).get()).get('status'), 'pending');
  await db.collection('account_deletion_jobs').doc(luidForUid(actor)).set({ status: 'complete' });
  const other = await sourceFixture(); const key = randomUUID();
  await assert.rejects(setPostMetrics(other.post.id, { views: 10, likes: 8, comments: 1 }, actor, 'Valid review reason', key, null), /account_deleting/);
  assert.equal((await other.post.get()).get('likes_count'), 2);
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).exists, false);
});
