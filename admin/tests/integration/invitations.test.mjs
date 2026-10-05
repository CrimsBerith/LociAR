import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';

assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb, adminAuth } = await import('../../lib/firebase-admin.ts');
const { createUserInvitation, acceptUserInvitation } = await import('../../lib/admin-invite.ts');
const { luidForUid } = await import('../../lib/account-lifecycle.ts');
after(async () => Promise.all(getApps().map(deleteApp)));

function input(roleKey = 'analyst') {
  return { key: randomUUID(), email: `invite-${randomUUID()}@example.test`, handle: null, roleKey,
    actorId: randomUUID(), reason: 'Emulator invitation verification' };
}
async function fixture(roleKey = 'analyst') {
  const request = input(roleKey); await createUserInvitation(request);
  const invite = adminDb().collection('admin_user_invites').doc(request.key);
  const uid = (await invite.get()).get('invited_user_id');
  await adminAuth().updateUser(uid, { emailVerified: true });
  return { request, invite, uid, identity: { email: request.email, emailVerified: true },
    role: adminDb().collection('admin_role_assignments').doc(`${uid}_${roleKey}`),
    audit: adminDb().collection('admin_audit_log').doc(`invite-accept-${request.key}`) };
}

test('concurrent invitation creation stores one Auth account, invitation and audit; different-payload replay fails', async () => {
  const request = input();
  const results = await Promise.all(Array.from({ length: 3 }, () => createUserInvitation(request)));
  assert.equal(results.filter(result => !result.idempotent).length, 1);
  const user = await adminAuth().getUserByEmail(request.email);
  assert.equal((await adminDb().collection('admin_user_invites').doc(request.key).get()).get('invited_user_id'), user.uid);
  assert.equal((await adminDb().collection('admin_audit_log').doc(request.key).get()).get('action'), 'user_invited');
  await assert.rejects(createUserInvitation({ ...request, email: 'different@example.test' }), /idempotency_key_reused/);
});

test('an audit-key conflict never commits an invitation; a legacy missing audit is repaired on replay', async () => {
  const request = input(); const db = adminDb();
  await db.collection('admin_audit_log').doc(request.key).set({ action: 'unrelated_operation', actor_id: request.actorId });
  await assert.rejects(createUserInvitation(request), /idempotency_key_reused/);
  assert.equal((await db.collection('admin_user_invites').doc(request.key).get()).exists, false);
  const legacy = input();
  await createUserInvitation(legacy); await db.collection('admin_audit_log').doc(legacy.key).delete();
  const before = (await db.collection('admin_user_invites').doc(legacy.key).get()).data();
  assert.equal((await createUserInvitation(legacy)).idempotent, true);
  assert.deepEqual((await db.collection('admin_user_invites').doc(legacy.key).get()).data(), before);
  assert.equal((await db.collection('admin_audit_log').doc(legacy.key).get()).get('action'), 'user_invited');
});

test('acceptance commits the role, accepted marker and audit once; replay preserves later revocation', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 3 }, () => acceptUserInvitation(f.uid, f.identity, f.request.key)));
  assert.deepEqual(results, [null, null, null]);
  assert.equal((await f.invite.get()).get('status'), 'accepted');
  assert.equal((await f.role.get()).get('role_key'), 'analyst');
  assert.equal((await f.audit.get()).get('action'), 'admin_invite_accepted');
  await f.role.update({ revoked_at: Timestamp.now() }); const revoked = (await f.role.get()).data();
  assert.equal(await acceptUserInvitation(f.uid, f.identity, f.request.key), null);
  assert.deepEqual((await f.role.get()).data(), revoked);
});

test('audit failure, wrong identity, unverified email and expiration cannot grant a role', async () => {
  for (const failure of ['audit', 'email', 'verified', 'expired', 'uid']) {
    const f = await fixture(); let identity = f.identity; let uid = f.uid;
    if (failure === 'audit') await f.audit.set({ action: 'unrelated_operation' });
    if (failure === 'email') identity = { ...identity, email: 'attacker@example.test' };
    if (failure === 'verified') identity = { ...identity, emailVerified: false };
    if (failure === 'expired') await f.invite.update({ expires_at: Timestamp.fromMillis(Date.now() - 1000) });
    if (failure === 'uid') uid = randomUUID();
    assert.ok(await acceptUserInvitation(uid, identity, f.request.key));
    assert.equal((await f.role.get()).exists, false); assert.equal((await f.invite.get()).get('status'), 'sent');
  }
});

test('regular invitations accept with audit but no admin role; regular callback cannot accept an admin invitation', async () => {
  const regular = await fixture(null);
  assert.equal(await acceptUserInvitation(regular.uid, regular.identity, regular.request.key, true), null);
  assert.equal((await regular.audit.get()).get('action'), 'user_invite_accepted');
  assert.equal((await adminDb().collection('admin_role_assignments').where('user_id', '==', regular.uid).get()).empty, true);
  const admin = await fixture();
  assert.equal(await acceptUserInvitation(admin.uid, admin.identity, admin.request.key, true), 'admin_invite_requires_admin_sign_in');
  assert.equal((await admin.role.get()).exists, false); assert.equal((await admin.invite.get()).get('status'), 'sent');
});

test('legacy acceptance audit repair preserves a revoked role and never recreates a missing role', async () => {
  const f = await fixture(); await acceptUserInvitation(f.uid, f.identity, f.request.key);
  await f.audit.delete(); await f.role.update({ revoked_at: Timestamp.now() });
  const revoked = (await f.role.get()).data();
  assert.equal(await acceptUserInvitation(f.uid, f.identity, f.request.key), null);
  assert.deepEqual((await f.role.get()).data(), revoked); assert.equal((await f.audit.get()).exists, true);
  await f.audit.delete(); await f.role.delete();
  assert.equal(await acceptUserInvitation(f.uid, f.identity, f.request.key), 'invite_legacy_incomplete');
  assert.equal((await f.role.get()).exists, false);
});

test('deletion tombstones block invite creation and role grants using the canonical Firebase UID mapping', async () => {
  assert.equal(luidForUid('firebase-test-user'), 'd97e1d29-8aa5-5432-8727-a0e4757e92a6');
  const f = await fixture();
  await adminDb().collection('account_deletion_jobs').doc(luidForUid(f.uid)).set({ status: 'pending' });
  assert.equal(await acceptUserInvitation(f.uid, f.identity, f.request.key), 'account_deletion_in_progress');
  assert.equal((await f.role.get()).exists, false); assert.equal((await f.invite.get()).get('status'), 'sent');
  const next = { ...f.request, key: randomUUID() };
  await assert.rejects(createUserInvitation(next), /account_deletion_in_progress/);
  assert.equal((await adminDb().collection('admin_user_invites').doc(next.key).get()).exists, false);
  const deletingInviter = input();
  await adminDb().collection('account_deletion_jobs').doc(luidForUid(deletingInviter.actorId)).set({ status: 'done' });
  await assert.rejects(createUserInvitation(deletingInviter), /account_deletion_in_progress/);
  assert.equal((await adminDb().collection('admin_user_invites').doc(deletingInviter.key).get()).exists, false);
});
