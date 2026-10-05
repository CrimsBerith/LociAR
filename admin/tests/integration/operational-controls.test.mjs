import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { createProtectedZone, setProtectedZoneActive, setServicePaused, revokeAdminRole, recordMfaEnrollment, resolveModerationFlag } = await import('../../lib/ops.ts');
const { luidForUid } = await import('../../lib/account-lifecycle.ts');
const db = adminDb();
after(async () => Promise.all(getApps().map(deleteApp)));
const actor = 'operations-' + randomUUID();
const reason = 'Operational integration verification';

test('emergency stop audit is atomic and payload-bound retries cannot flip a later state', async () => {
  const key = randomUUID();
  await Promise.all([setServicePaused(true, actor, reason, key), setServicePaused(true, actor, reason, key)]);
  const flags = db.collection('system').doc('flags');
  assert.equal((await flags.get()).get('kill_switch'), true);
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('action'), 'kill_switch_on');
  await assert.rejects(setServicePaused(false, actor, reason, key), /idempotency_key_reused/);
  assert.equal((await flags.get()).get('kill_switch'), true);
  await setServicePaused(false, actor, reason, randomUUID());
  await setServicePaused(true, actor, reason, key);
  assert.equal((await flags.get()).get('kill_switch'), false);
});

test('zone creation retries reuse one record and changed payloads cannot overwrite it', async () => {
  const zone = { name: 'Regression school', category: 'school', lat: 41, lng: 29, radius_meters: 150 };
  const key = randomUUID();
  const [first, retry] = await Promise.all([createProtectedZone(zone, actor, reason, key), createProtectedZone(zone, actor, reason, key)]);
  assert.deepEqual(first, retry);
  await assert.rejects(createProtectedZone({ ...zone, radius_meters: 900 }, actor, reason, key), /idempotency_key_reused/);
  assert.equal((await db.collection('protected_zones').doc(first.id).get()).get('radius_meters'), 150);
  const toggle = randomUUID();
  await setProtectedZoneActive(first.id, false, actor, reason, toggle);
  await assert.rejects(setProtectedZoneActive(first.id, true, actor, reason, toggle), /idempotency_key_reused/);
  assert.equal((await db.collection('protected_zones').doc(first.id).get()).get('active'), false);
});

test('concurrent MFA observations produce one audit without retaining factor IDs in that audit', async () => {
  const uid = 'mfa-' + randomUUID();
  await Promise.all([recordMfaEnrollment(uid, ['secret-factor-id']), recordMfaEnrollment(uid, ['secret-factor-id'])]);
  const audits = await db.collection('admin_audit_log').where('actor_id', '==', uid).get();
  assert.equal(audits.size, 1);
  assert.equal(JSON.stringify(audits.docs[0].data()).includes('secret-factor-id'), false);
  assert.deepEqual((await db.collection('admin_mfa_state').doc(uid).get()).get('factor_ids'), ['secret-factor-id']);
  await recordMfaEnrollment(uid, []);
  assert.equal((await db.collection('admin_audit_log').where('actor_id', '==', uid).get()).size, 2);
});

test('deleted admin identities cannot change service flags, create zones or write MFA state', async () => {
  const uid = 'deleted-' + randomUUID();
  await db.collection('account_deletion_jobs').doc(luidForUid(uid)).set({ status: 'done' });
  await assert.rejects(setServicePaused(true, uid, reason, randomUUID()), /account_deleting/);
  await assert.rejects(createProtectedZone({ name: 'Denied school', category: 'school', lat: 0, lng: 0, radius_meters: 150 }, uid, reason, randomUUID()), /account_deleting/);
  await assert.rejects(recordMfaEnrollment(uid, ['factor']), /account_deleting/);
});

test('concurrent role revocations cannot remove the last active super admin', async () => {
  const prior = await db.collection('admin_role_assignments').where('role_key', '==', 'super_admin').get();
  for (const doc of prior.docs) await doc.ref.update({ revoked_at: new Date() });
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) await db.collection('admin_role_assignments').doc(id).set({ user_id: id, role_key: 'super_admin', revoked_at: null });
  const results = await Promise.allSettled(ids.map(id => revokeAdminRole(id, actor, reason, randomUUID())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(String(results.find(r => r.status === 'rejected').reason), /cannot_revoke_last_super_admin/);
  assert.equal((await db.collection('admin_role_assignments').where('role_key', '==', 'super_admin').where('revoked_at', '==', null).get()).size, 1);
  const remaining = (await db.collection('admin_role_assignments').where('role_key', '==', 'super_admin').where('revoked_at', '==', null).get()).docs[0];
  const deletedUid = randomUUID();
  await db.collection('admin_role_assignments').doc(deletedUid).set({ user_id: deletedUid, role_key: 'super_admin', revoked_at: null });
  await db.collection('account_deletion_jobs').doc(luidForUid(deletedUid)).set({ status: 'done' });
  await assert.rejects(revokeAdminRole(remaining.id, actor, reason, randomUUID()), /cannot_revoke_last_super_admin/);
  assert.equal((await remaining.ref.get()).get('revoked_at'), null, 'a deleted identity does not count as a usable backup admin');
});

test('false-positive restoration removes the exclusion marker and cannot resurrect deleted authors', async () => {
  const author = randomUUID(), owner = randomUUID(), post = randomUUID(), comment = randomUUID(), flag = randomUUID();
  await db.collection('profiles').doc(author).set({ handle: 'restored-author', deleted_at: null });
  await db.collection('posts').doc(post).set({ creator_id: owner, status: 'active', visibility: 'public' });
  const flagged = { server_origin: 'comment_filter', reason: 'comment_filtered', post_id: post, status: 'open', metadata: { author_id: author, comment_id: comment, text: 'false positive' } };
  await db.collection('moderation_flags').doc(flag).set(flagged);
  await db.collection('moderation_originals').doc(flag).set({target:'comment',id:comment,post_id:post,user_id:author,text:'false positive'});
  await db.collection('filtered_comments').doc(comment).set({ post_id: post });
  await resolveModerationFlag(flag, 'approve', actor, reason, randomUUID());
  assert.equal((await db.collection('comments').doc(comment).get()).get('admin_restored'), true);
  assert.equal((await db.collection('filtered_comments').doc(comment).get()).exists, false);
  const another = randomUUID();
  await db.collection('account_deletion_jobs').doc(author).set({ status: 'done' });
  await db.collection('moderation_flags').doc(another).set({ ...flagged, metadata: { ...flagged.metadata, comment_id: randomUUID() } });
  await assert.rejects(resolveModerationFlag(another, 'approve', actor, reason, randomUUID()), /account_deleting/);
  assert.equal((await db.collection('moderation_flags').doc(another).get()).get('status'), 'open');
});
