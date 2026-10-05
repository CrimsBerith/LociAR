import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';

// Refuse to run mutations against a live project, even if credentials are injected.
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'A local Firestore emulator is required');
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { moderatePost, resolveModerationFlag } = await import('../../lib/ops.ts');
after(async () => Promise.all(getApps().map(deleteApp)));

test('author deletions cannot be relabeled or restored through post or flag moderation', async () => {
  const db = adminDb();
  const ref = db.collection('posts').doc(randomUUID());
  await ref.set({ creator_id: randomUUID(), status: 'removed', deleted_at: new Date(), age_rating: 'all', visibility: 'public' });
  const original = (await ref.get()).data();

  for (const action of ['soft_delete', 'restore', 'approve', 'flag']) {
    await assert.rejects(moderatePost(ref.id, action, 'test-admin', 'Regression test reason', randomUUID()), /post_deleted_by_author/);
    assert.deepEqual((await ref.get()).data(), original);
  }
  const flag = db.collection('moderation_flags').doc(randomUUID());
  await flag.set({ post_id: ref.id, status: 'open' });
  await assert.rejects(resolveModerationFlag(flag.id, 'soft_delete', 'test-admin', 'Regression test reason', randomUUID()), /post_deleted_by_author/);
  assert.equal((await flag.get()).get('status'), 'open');
  assert.deepEqual((await ref.get()).data(), original);
});

test('moderator deletion still supports audited idempotent deletion, restore and approval', async () => {
  const db = adminDb();
  const ref = db.collection('posts').doc(randomUUID());
  await ref.set({ creator_id: randomUUID(), status: 'active', deleted_at: null, age_rating: 'all', visibility: 'public' });
  const key = randomUUID();
  await moderatePost(ref.id, 'soft_delete', 'test-admin', 'Regression test reason', key);
  const removed = (await ref.get()).data();
  assert.equal(removed.status, 'removed');
  assert.equal(removed.deleted_by, 'test-admin');
  await moderatePost(ref.id, 'soft_delete', 'test-admin', 'Regression test reason', key);
  assert.deepEqual((await ref.get()).data(), removed);
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('resource_id'), ref.id);
  await moderatePost(ref.id, 'restore', 'test-admin', 'Regression test reason', randomUUID());
  assert.equal((await ref.get()).get('status'), 'pending_review');
  await moderatePost(ref.id, 'approve', 'test-admin', 'Regression test reason', randomUUID());
  assert.equal((await ref.get()).get('status'), 'active');
});
