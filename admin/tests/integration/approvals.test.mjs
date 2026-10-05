import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'A local Firestore emulator is required');
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { decideApproval, postVersion, consumeRateLimit, setUserSuspended } = await import('../../lib/ops.ts');
after(async () => Promise.all(getApps().map(deleteApp)));

async function fixture(options = {}) {
  const db = adminDb();
  const post = db.collection('posts').doc(randomUUID());
  await post.set({ status: 'active', views_count: 1, likes_count: 2, comments_count: 3, saves_count: 4, updated_at: Timestamp.now() });
  const requester = randomUUID(); const approver = randomUUID();
  const approval = db.collection('admin_approval_requests').doc(randomUUID());
  await approval.set({ action: 'post_metrics_set', resource_type: 'post', resource_id: post.id,
    requested_by: requester, target_version: postVersion((await post.get()).data()),
    payload: { viewsCount: 11, likesCount: 12, commentsCount: 13 }, reason: 'Integration review reason',
    expires_at: Timestamp.fromMillis(Date.now() + 60_000), status: 'pending', ...options });
  return { db, post, approval, requester, approver };
}
test('self approval is rejected before any metric, decision or audit mutation', async () => {
  const f = await fixture(); const key = randomUUID();
  await assert.rejects(decideApproval(f.approval.id, 'approved', f.requester, 'Valid review reason', key), /self_approval_forbidden/);
  assert.equal((await f.post.get()).get('likes_count'), 2);
  assert.equal((await f.approval.get()).get('status'), 'pending');
  assert.equal((await f.db.collection('admin_audit_log').doc(key).get()).exists, false);
});
test('expired and changed targets are terminal decisions and cannot change metrics', async () => {
  for (const kind of ['expired', 'invalidated']) {
    const f = await fixture(kind === 'expired' ? { expires_at: Timestamp.fromMillis(Date.now() - 1) } : {});
    if (kind === 'invalidated') await f.post.update({ likes_count: 99 });
    const before = (await f.post.get()).data(); const key = randomUUID();
    await decideApproval(f.approval.id, 'approved', f.approver, 'Valid review reason', key);
    assert.equal((await f.approval.get()).get('status'), kind);
    assert.deepEqual((await f.post.get()).data(), before);
    assert.equal((await f.db.collection('admin_audit_log').doc(key).get()).get('action'), `approval_${kind}`);
  }
});
test('concurrent replay applies metrics once with immutable decision, post and metric audit evidence', async () => {
  const f = await fixture(); const key = randomUUID();
  await Promise.all(Array.from({ length: 3 }, () => decideApproval(f.approval.id, 'approved', f.approver, 'Valid review reason', key)));
  assert.equal((await f.approval.get()).get('status'), 'approved');
  assert.equal((await f.post.get()).get('likes_count'), 12);
  const audits = await f.db.collection('admin_audit_log').where('actor_id', '==', f.approver).get();
  assert.deepEqual(audits.docs.map(d => d.get('action')).sort(), ['approval_approved', 'post_metrics_set']);
  const changes = await f.db.collection('admin_metric_changes').where('approval_request_id', '==', f.approval.id).get();
  assert.equal(changes.size, 1);
  const before = (await f.approval.get()).data();
  await decideApproval(f.approval.id, 'rejected', randomUUID(), 'Different review reason', randomUUID());
  assert.deepEqual((await f.approval.get()).data(), before);
});
test('rejection and missing targets invalidate without applying requested metrics', async () => {
  for (const missing of [false, true]) {
    const f = await fixture(); if (missing) await f.post.delete();
    await decideApproval(f.approval.id, missing ? 'approved' : 'rejected', f.approver, 'Valid review reason', randomUUID());
    assert.equal((await f.approval.get()).get('status'), 'invalidated');
    if (!missing) assert.equal((await f.post.get()).get('likes_count'), 2);
  }
});
test('concurrent rate-limit attempts cannot exceed the configured limit', async () => {
  const allowed = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(randomUUID(), 'unique', 1, 60)));
  assert.equal(allowed.filter(Boolean).length, 8);
  const actor = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(actor, 'approval-regression', 3, 3600)));
  assert.equal(results.filter(Boolean).length, 3);
});
test('suspension retries do not duplicate the audit or overwrite a later decision', async () => {
  const db = adminDb(); const profile = db.collection('profiles').doc(randomUUID()); const key = randomUUID();
  await profile.set({ suspended_at: null, deleted_at: null });
  await setUserSuspended(profile.id, true, 'integration-admin', 'Valid suspension reason', key);
  const suspended = (await profile.get()).data();
  await assert.rejects(setUserSuspended(profile.id, false, 'integration-admin', 'Valid suspension reason', key), /idempotency_key_reused/);
  await setUserSuspended(profile.id, true, 'integration-admin', 'Valid suspension reason', key);
  assert.deepEqual((await profile.get()).data(), suspended);
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('action'), 'user_suspend');
});
