import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb, newUser, expectFailure, closeClients, postBody } from './_harness.mjs';
import { acceptAccountDeletion, runAccountDeletion, retryPendingAccountDeletions } from '../../lib/accountDeletion.js';
import { backfillAccountAccess } from '../../scripts/backfill-account-access.mjs';

after(closeClients);
const jobRef = user => adminDb.collection('account_deletion_jobs').doc(user.luid);
const accepted = async user => acceptAccountDeletion({
  uid: user.uid, luid: user.luid, email: user.user.email, emailVerified: true,
  provider: 'password', isAppleUser: false, adminRole: null,
});
const object = user => getStorage().bucket().file(`post-world-maps/${user.luid}/${randomUUID()}/a.lociarmap`);
const absentAuth = user => assert.rejects(adminAuth.getUser(user.uid), /no user record/i);

test('account deletion propagates a rejected Firestore batch and retries without skipping surviving rows', async () => {
  const user = await newUser();
  const postId = randomUUID();
  const post = adminDb.collection('posts').doc(postId);
  await post.set({ creator_id: user.luid, status: 'pending_review', visibility: 'public' });
  const like = adminDb.collection('likes').doc(`${postId}_${user.luid}`);
  await like.set({ user_id: user.luid, post_id: postId });
  await accepted(user);
  let storageCalls = 0;
  await assert.rejects(runAccountDeletion(user.luid, {
    commitBatch: async () => { throw new Error('synthetic permanent batch rejection'); },
    deleteStorage: async () => { storageCalls++; return 0; },
  }), /synthetic permanent batch rejection/);
  assert.equal(storageCalls, 0, 'a failed Firestore write never advances to Storage');
  assert.equal((await post.get()).exists, true);
  assert.equal((await like.get()).exists, true);
  assert.ok(await adminAuth.getUser(user.uid));
  const failed = (await jobRef(user).get()).data();
  assert.equal(failed.status, 'pending');
  assert.equal(failed.lease_owner, undefined);
  assert.ok(failed.next_at instanceof Timestamp);
  assert.equal(failed.last_error, 'retryable_operation_failed');
  assert.equal(await runAccountDeletion(user.luid), 'done');
  assert.equal((await post.get()).exists, false);
  assert.equal((await like.get()).exists, false);
  assert.equal((await jobRef(user).get()).get('posts_removed'), 1);
  await absentAuth(user);
});

test('storage failure keeps a durable fence after profile removal and rejects callable resurrection', async () => {
  const user = await newUser();
  const file = object(user);
  await file.save(Buffer.from('synthetic-world-map'));
  await accepted(user);
  await assert.rejects(runAccountDeletion(user.luid, { deleteStorage: async () => { throw new Error('synthetic Storage outage'); } }), /Storage outage/);
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  assert.ok(await adminAuth.getUser(user.uid), 'Storage must be deleted before Auth');
  assert.equal((await file.exists())[0], true);
  const calls = [
    ['ensureProfile', {}], ['updateHandle', { handle: `retry_${randomUUID().slice(0, 8)}` }],
    ['createPost', postBody()], ['beginAvatarUpload', {}], ['getArcoreToken', {}],
    ['registerCloudAnchor', { cloudAnchorId: `synthetic_${randomUUID().replaceAll('-', '')}` }],
    ['markActivityRead', { userId: user.luid, activityIds: ['missing'] }],
    ['registerPushToken', { userId: user.luid, installationId: randomUUID(), token: 'synthetic-fcm-token-'.repeat(6), locale: 'en' }],
  ];
  for (const [name, data] of calls) {
    const error = await expectFailure(user.call(name, data));
    assert.equal(error.code, 'functions/permission-denied', `${name} cannot write for a deleting account`);
    assert.equal(error.details?.reason, 'profile_missing', name);
  }
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('users_private').doc(user.luid).get()).exists, false);
  assert.equal(await runAccountDeletion(user.luid), 'done');
  assert.equal((await file.exists())[0], false);
  await absentAuth(user);
  const done = (await jobRef(user).get()).data();
  assert.equal(done.status, 'done');
  assert.equal((await adminDb.collection('account_access').doc(user.luid).get()).get('state'), 'done');
  assert.equal(done.uid, undefined, 'terminal tombstone keeps no Firebase UID/email');
  assert.equal(done.next_at, undefined);
});

test('Auth failure retries the accepted deletion without losing the job or restoring private data', async () => {
  const user = await newUser();
  const role = adminDb.collection('admin_role_assignments').doc(`${user.uid}_moderator`);
  const invite = adminDb.collection('admin_user_invites').doc(randomUUID());
  const mfa = adminDb.collection('admin_mfa_state').doc(user.uid);
  await mfa.set({ factor_ids: ['synthetic-factor-id'] });
  await role.set({ user_id: user.uid, role_key: 'moderator', revoked_at: null });
  await invite.set({ invited_user_id: user.uid, email: user.user.email, status: 'sent' });
  const file = object(user);
  await file.save(Buffer.from('synthetic-world-map'));
  await accepted(user);
  await assert.rejects(runAccountDeletion(user.luid, { deleteAuthUser: async () => { throw new Error('synthetic Auth outage'); } }), /Auth outage/);
  assert.equal((await file.exists())[0], false);
  assert.equal((await jobRef(user).get()).get('stage'), 'auth');
  assert.equal((await role.get()).exists, false);
  assert.equal((await invite.get()).exists, false);
  assert.equal((await mfa.get()).exists, false, 'MFA factor identifiers do not survive account deletion or an Auth outage');
  assert.ok(await adminAuth.getUser(user.uid));
  assert.deepEqual(await user.call('deleteAccount', { userId: user.luid }), { ok: true });
  assert.equal((await jobRef(user).get()).get('status'), 'done');
  assert.equal((await adminDb.collection('users_private').doc(user.luid).get()).exists, false);
  await absentAuth(user);
});

test('scheduled retry completes a crash after Auth deletion without needing a user session', async () => {
  const user = await newUser();
  await accepted(user);
  await assert.rejects(runAccountDeletion(user.luid, {
    deleteAuthUser: async uid => { await adminAuth.deleteUser(uid); throw new Error('synthetic crash after Auth delete'); },
  }), /crash after Auth delete/);
  await absentAuth(user);
  await jobRef(user).update({ next_at: Timestamp.fromMillis(0) });
  assert.ok(await retryPendingAccountDeletions() >= 1);
  const done = (await jobRef(user).get()).data();
  assert.equal(done.status, 'done');
  assert.equal(done.uid, undefined);
  assert.equal(await runAccountDeletion(user.luid), 'done', 'completed work is idempotent');
});

test('concurrent deletion workers claim one lease and do not duplicate Storage/Auth side effects', async () => {
  const user = await newUser();
  await accepted(user);
  let signalReached;
  const reached = new Promise(resolve => { signalReached = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let sweeps = 0;
  let authCalls = 0;
  const first = runAccountDeletion(user.luid, {
    deleteStorage: async () => { sweeps++; signalReached(); await gate; return 0; },
    deleteAuthUser: async uid => { authCalls++; await adminAuth.deleteUser(uid); },
  });
  try {
    await reached;
    assert.equal(await runAccountDeletion(user.luid), 'busy');
    await jobRef(user).update({ next_at: Timestamp.fromMillis(0) });
    assert.equal(await retryPendingAccountDeletions(Date.now(), 1), 0, 'a busy job is not counted as completed');
    assert.equal((await jobRef(user).get()).get('attempts'), 1);
  } finally { release(); }
  assert.equal(await first, 'done');
  assert.equal(authCalls, 1);
  assert.equal(sweeps, 2, 'initial and final Storage sweeps belong to the same worker');
});

test('an expired abandoned lease is reclaimed; an unexpired lease is respected', async () => {
  const user = await newUser();
  await accepted(user);
  await jobRef(user).update({ lease_owner: 'synthetic-dead-worker', lease_until: Timestamp.fromMillis(Date.now() + 60_000) });
  assert.equal(await runAccountDeletion(user.luid), 'busy');
  assert.ok(await adminAuth.getUser(user.uid));
  await jobRef(user).update({ lease_until: Timestamp.fromMillis(0), next_at: Timestamp.fromMillis(0) });
  assert.ok(await retryPendingAccountDeletions() >= 1);
  assert.equal((await jobRef(user).get()).get('status'), 'done');
  await absentAuth(user);
});

test('a exhausted time budget releases the lease for independent resumption', async () => {
  const user = await newUser();
  await accepted(user);
  assert.equal(await runAccountDeletion(user.luid, { budgetMs: 0 }), 'pending');
  const pending = (await jobRef(user).get()).data();
  assert.equal(pending.lease_owner, undefined);
  assert.equal(pending.last_error, 'budget_exhausted');
  assert.ok(await adminAuth.getUser(user.uid));
  assert.equal(await runAccountDeletion(user.luid), 'done');
  await absentAuth(user);
});

test('concurrent ensureProfile calls cannot recreate the public/private records after deletion is accepted', async () => {
  const user = await newUser();
  const provisioning = Promise.allSettled(Array.from({ length: 8 }, () => user.call('ensureProfile', {})));
  await accepted(user);
  await provisioning;
  assert.ok((await adminDb.collection('profiles').doc(user.luid).get()).get('deleted_at'));
  assert.equal(await runAccountDeletion(user.luid), 'done');
  // The emulator accepts an already issued ID token too, exercising the permanent server fence.
  await assert.rejects(user.call('ensureProfile', {}));
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('users_private').doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('handles').where('luid', '==', user.luid).get()).size, 0);
});

test('paged social-row deletion resumes after a later rejected page without skipping surviving data', async () => {
  const user = await newUser();
  for (let offset = 0; offset < 650; offset += 300) {
    const batch = adminDb.batch();
    for (let i = offset; i < Math.min(650, offset + 300); i++) {
      batch.set(adminDb.collection('collections').doc(`${user.luid}_${i}`), { owner_id: user.luid, title: 'synthetic' });
    }
    await batch.commit();
  }
  await accepted(user);
  let pages = 0;
  await assert.rejects(runAccountDeletion(user.luid, {
    commitBatch: async batch => { if (++pages === 2) throw new Error('synthetic second-page failure'); return batch.commit(); },
  }), /second-page failure/);
  assert.equal((await adminDb.collection('collections').where('owner_id', '==', user.luid).count().get()).data().count, 350);
  assert.equal(await runAccountDeletion(user.luid), 'done');
  assert.equal((await adminDb.collection('collections').where('owner_id', '==', user.luid).count().get()).data().count, 0);
  await absentAuth(user);
});

test('access backfill defaults to read-only and never reactivates suspended/deleting legacy profiles', async () => {
  const ids = Array.from({ length: 4 }, () => randomUUID());
  try {
    for (const id of ids) await adminDb.collection('profiles').doc(id).set({ suspended: false, deleted_at: null });
    await adminDb.collection('profiles').doc(ids[1]).update({ suspended: true });
    await adminDb.collection('profiles').doc(ids[2]).update({ deleted_at: Timestamp.now() });
    // Even inconsistent legacy data (profile says active) must defer to the permanent job.
    await adminDb.collection('account_deletion_jobs').doc(ids[3]).set({ status: 'pending' });
    await adminDb.collection('account_access').doc(ids[3]).set({ state: 'active' });
    assert.equal((await adminDb.collection('account_access').doc(ids[0]).get()).exists, false);
    await backfillAccountAccess(adminDb, { pageSize: 2 });
    assert.equal((await adminDb.collection('account_access').doc(ids[0]).get()).exists, false, 'dry-run does not create access records');
    assert.equal((await adminDb.collection('account_access').doc(ids[3]).get()).get('state'), 'active', 'dry-run performs no repairs');
    await backfillAccountAccess(adminDb, { apply: true, pageSize: 2 });
    for (const [index, state] of ['active', 'suspended', 'deleting', 'deleting'].entries()) {
      assert.equal((await adminDb.collection('account_access').doc(ids[index]).get()).get('state'), state);
    }
  } finally {
    for (const id of ids) {
      await adminDb.collection('profiles').doc(id).delete();
      await adminDb.collection('account_deletion_jobs').doc(id).delete();
      await adminDb.collection('account_access').doc(id).delete();
    }
  }
});
