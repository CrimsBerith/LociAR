// Acceptance tests for the security fixes in issues #4, #7 and #8 (run via `npm run test:emulator`).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, closeClients, expectFailure, newAppleUser, newUser, postBody, PROJECT } from './_harness.mjs';
import { APPLE_STUB_PORT } from './prepare-env.mjs';
// In-process handlers (the harness initialises firebase-admin against the emulators).
import { onCommentCreated } from '../../lib/triggers.js';
import { purgeStalePendingAvatars } from '../../lib/avatar.js';

// Stub for https://appleid.apple.com/auth/{token,revoke}; APPLE_AUTH_BASE_URL points here.
let appleStatus = 400;
const appleCalls = [];
const appleStub = createServer((req, res) => {
  appleCalls.push(req.url);
  if (appleStatus !== 200) {
    res.writeHead(appleStatus, { 'content-type': 'application/json' }).end('{"error":"invalid_grant"}');
    return;
  }
  const body = req.url === '/auth/token' ? '{"refresh_token":"stub-refresh"}' : '{}';
  res.writeHead(200, { 'content-type': 'application/json' }).end(body);
});
before(() => new Promise((resolve) => appleStub.listen(APPLE_STUB_PORT, '127.0.0.1', resolve)));
after(async () => {
  await new Promise((resolve) => appleStub.close(resolve));
  await closeClients();
});

const anchorPose = (cloudAnchorId, lat = 40.2, lng = 29.1) => ({
  latitude: lat, longitude: lng, heading: 10, accuracy: 8,
  anchor: {
    coordinateSpace: 'visual_surface', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(),
    persistence: { kind: 'arcore_cloud_anchor', cloudAnchorId, version: 1, originalNativeAnchorId: 'x', hostedAt: new Date().toISOString() },
  },
});
const anchorId = () => `ua-${randomUUID().replace(/-/g, '')}`;
const hourDoc = (luid) => adminDb.collection('post_quota').doc(`${luid}_h${Math.floor(Date.now() / 3_600_000)}`);

test('registerCloudAnchor: 100 registrations a day, the 101st is refused; unbound records expire', async () => {
  const user = await newUser();
  const ids = Array.from({ length: 100 }, anchorId);
  // The app registers one anchor per hosted pin, one after another.
  for (const cloudAnchorId of ids) await user.call('registerCloudAnchor', { cloudAnchorId });
  const limited = await expectFailure(user.call('registerCloudAnchor', { cloudAnchorId: anchorId() }));
  assert.equal(limited.code, 'functions/resource-exhausted');
  assert.equal(limited.details?.reason, 'rate_limited');
  // Re-registering an id you already own is idempotent and does not need a slot.
  assert.deepEqual(await user.call('registerCloudAnchor', { cloudAnchorId: ids[0] }), { registered: true });

  const record = (await adminDb.collection('cloud_anchors').doc(ids[0]).get()).data();
  const ttlDays = (record.expires_at.toMillis() - Date.now()) / 86_400_000;
  assert.ok(ttlDays > 29.9 && ttlDays <= 30, `unbound record expires in 30 days (the orphan grace), got ${ttlDays}`);
  await user.call('createPost', postBody({ pose: anchorPose(ids[0]) }));
  const bound = (await adminDb.collection('cloud_anchors').doc(ids[0]).get()).data();
  assert.equal(bound.expires_at, undefined, 'binding to a post removes the expiry');
});

test('registerCloudAnchor: parallel calls never exceed the quota and contention is retryable, not INTERNAL', async () => {
  const user = await newUser();
  const day = Math.floor(Date.now() / 86_400_000);
  await adminDb.collection('anchor_quota').doc(`${user.luid}_d${day}`).set({ owner_luid: user.luid, count: 97 });
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => user.call('registerCloudAnchor', { cloudAnchorId: anchorId() })));
  let registered = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') { registered += 1; continue; }
    const { code, details } = result.reason;
    assert.ok(
      (code === 'functions/resource-exhausted' && details?.reason === 'rate_limited')
        || (code === 'functions/unavailable' && details?.reason === 'busy_retry'),
      `unexpected failure ${code} ${JSON.stringify(details)}`,
    );
  }
  assert.ok(registered <= 3, `at most 3 slots were left, ${registered} registered`);
  const count = (await adminDb.collection('anchor_quota').doc(`${user.luid}_d${day}`).get()).data().count;
  assert.equal(count, 97 + registered);
});

test('cloud anchors: B cannot post with A\'s anchor, and B deleting a post never touches A\'s anchor', async () => {
  const alice = await newUser();
  const bob = await newUser();
  const id = anchorId();
  await alice.call('registerCloudAnchor', { cloudAnchorId: id });
  const alicePost = postBody({ pose: anchorPose(id, 40.3, 29.2) });
  await alice.call('createPost', alicePost);

  const stolen = await expectFailure(bob.call('createPost', postBody({ pose: anchorPose(id, 40.31, 29.2) })));
  assert.equal(stolen.code, 'functions/invalid-argument');

  // Legacy data: a post of Bob's that names Alice's anchor id (written before ownership records).
  const legacyId = randomUUID();
  await adminDb.collection('posts').doc(legacyId).set({
    id: legacyId, creator_id: bob.luid, status: 'active', visibility: 'public', age_rating: 'all', cloud_anchor_id: id, deleted_at: null,
  });
  assert.deepEqual(await bob.call('deleteOwnPost', { postId: legacyId }), { removed: true });
  const record = (await adminDb.collection('cloud_anchors').doc(id).get()).data();
  assert.equal(record?.owner_luid, alice.luid, 'Alice still owns the anchor record');
  assert.equal(record?.post_id, alicePost.clientMutationId, 'and it is still bound to her post');
  assert.equal((await adminDb.collection('cloud_anchor_deletions').doc(id).get()).exists, false, 'no deletion was queued');
});

test('createPost: a failed publish gives its quota slot back', async () => {
  const user = await newUser();
  const failed = await expectFailure(user.call('createPost', postBody({ pose: anchorPose(anchorId(), 40.4, 29.3) })));
  assert.equal(failed.code, 'functions/invalid-argument');
  assert.equal(Number((await hourDoc(user.luid).get()).data()?.count ?? 0), 0);
  await user.call('createPost', postBody({ pose: { latitude: 40.41, longitude: 29.3, heading: 0, accuracy: 5 } }));
  assert.equal((await hourDoc(user.luid).get()).data().count, 1);
});

test('createPost: density rejections write one moderation flag per window, not one per request', async () => {
  const spot = { latitude: 40.5, longitude: 29.4, heading: 0, accuracy: 5 };
  for (let i = 0; i < 5; i++) {
    const owner = await newUser();
    await owner.call('createPost', postBody({ pose: spot }));
  }
  const user = await newUser();
  for (let i = 0; i < 3; i++) {
    const denied = await expectFailure(user.call('createPost', postBody({ pose: spot })));
    assert.equal(denied.details?.reason, 'rate_limited');
  }
  const flags = await adminDb.collection('moderation_flags').where('user_id', '==', user.luid).get();
  assert.equal(flags.size, 1);
  assert.equal(flags.docs[0].data().metadata.limit, 'density');
  assert.equal(Number((await hourDoc(user.luid).get()).data()?.count ?? 0), 0, 'rejections consume no quota');
});

/** An unsigned ID token; the Auth emulator does not check signatures, but every other claim. */
function emulatorToken(user, claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: user.uid, user_id: user.uid,
    iat: now - 10, exp: now + 3600, auth_time: now - 10, email_verified: true, luid: user.luid,
    firebase: { sign_in_provider: 'password', identities: {} },
    ...claims,
  };
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

test('deleteAccount: a sign-in older than 5 minutes is refused with reauth_required', async () => {
  const user = await newUser();
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/deleteAccount`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${emulatorToken(user, { auth_time: Math.floor(Date.now() / 1000) - 600 })}` },
    body: JSON.stringify({ data: {} }),
  });
  const body = await response.json();
  assert.equal(body.error?.status, 'FAILED_PRECONDITION');
  assert.equal(body.error?.details?.reason, 'reauth_required');
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, true);
});

test('deleteAccount (Apple): without a code or when Apple answers 400 nothing is deleted', async () => {
  const user = await newAppleUser();
  const post = postBody({ pose: { latitude: 40.6, longitude: 29.5, heading: 0, accuracy: 5 } });
  await user.call('createPost', post);

  const noCode = await expectFailure(user.call('deleteAccount', {}));
  assert.equal(noCode.details?.reason, 'apple_revoke_failed');
  const legacy = await expectFailure(user.call('deleteAccount', { appleRevokedByClient: true }));
  assert.equal(legacy.details?.reason, 'apple_revoke_failed', 'a client claim of revocation is not accepted');

  appleStatus = 400;
  appleCalls.length = 0;
  const rejected = await expectFailure(user.call('deleteAccount', { appleAuthorizationCode: 'code-from-ios' }));
  assert.equal(rejected.code, 'functions/failed-precondition');
  assert.equal(rejected.details?.reason, 'apple_revoke_failed');
  assert.deepEqual(appleCalls, ['/auth/token']);
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, true);
  assert.equal((await adminDb.collection('posts').doc(post.clientMutationId).get()).exists, true);
  assert.ok(await adminAuth.getUser(user.uid));
});

test('deleteAccount (Apple): revokes with Apple, then removes unbound anchors and anonymises profile-text flags', async () => {
  const user = await newAppleUser();
  const unbound = anchorId();
  await user.call('registerCloudAnchor', { cloudAnchorId: unbound });
  const flagRef = adminDb.collection('moderation_flags').doc(randomUUID());
  await flagRef.set({ post_id: null, user_id: user.luid, reason: 'profile_text_filtered', status: 'open', metadata: { field: 'bio', text: 'kötü söz' } });

  appleStatus = 200;
  appleCalls.length = 0;
  assert.deepEqual(await user.call('deleteAccount', { appleAuthorizationCode: 'code-from-ios' }), { ok: true });
  assert.deepEqual(appleCalls, ['/auth/token', '/auth/revoke']);
  assert.equal((await adminDb.collection('cloud_anchors').doc(unbound).get()).exists, false);
  const flag = (await flagRef.get()).data();
  assert.equal(flag.user_id, null);
  assert.equal(flag.metadata.text, null);
  await assert.rejects(adminAuth.getUser(user.uid), /no user record/i);
});

test('deleteAccount removes an account with 1000 posts', { timeout: 600_000 }, async () => {
  const user = await newUser();
  const ids = Array.from({ length: 1000 }, () => randomUUID());
  for (let i = 0; i < ids.length; i += 400) {
    const batch = adminDb.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.set(adminDb.collection('posts').doc(id), {
        id, creator_id: user.luid, status: 'pending_review', visibility: 'public', age_rating: 'all', deleted_at: null, created_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await adminDb.collection('likes').doc(`${ids[0]}_${user.luid}`).set({ post_id: ids[0], user_id: user.luid });
  assert.deepEqual(await user.call('deleteAccount', {}, 540_000), { ok: true });
  const left = await adminDb.collection('posts').where('creator_id', '==', user.luid).count().get();
  assert.equal(left.data().count, 0);
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  await assert.rejects(adminAuth.getUser(user.uid), /no user record/i);
});

test('filtered comment: the same event delivered twice writes one flag and one analytics event', async () => {
  const commentId = randomUUID();
  const postId = randomUUID();
  const comment = { id: commentId, post_id: postId, user_id: randomUUID(), text: 'siktir git' };
  const snapshot = { id: commentId, ref: adminDb.collection('comments').doc(commentId), data: () => comment };
  const event = { id: `evt-${commentId}`, params: { id: commentId }, data: snapshot };
  await onCommentCreated.run(event);
  await onCommentCreated.run(event);
  const flags = await adminDb.collection('moderation_flags').where('metadata.comment_id', '==', commentId).get();
  assert.equal(flags.size, 1);
  assert.equal(flags.docs[0].id, `comment_${commentId}`);
  const events = await adminDb.collection('analytics_events').where('post_id', '==', postId).where('event_name', '==', 'comment_filtered').get();
  assert.equal(events.size, 1);
});

test('avatars: the quota counts uploads (6th slot refused), suspended users get no slot, screening needs a slot', async () => {
  const user = await newUser();
  for (let i = 0; i < 5; i++) {
    const { objectId } = await user.call('beginAvatarUpload', {});
    assert.match(objectId, /^[0-9a-f-]{36}$/);
  }
  const sixth = await expectFailure(user.call('beginAvatarUpload', {}));
  assert.equal(sixth.code, 'functions/resource-exhausted');
  assert.equal(sixth.details?.reason, 'rate_limited');

  // An upload with no slot (e.g. written past the rules) is not screened and is deleted.
  const path = `avatars/${user.luid}/pending/${randomUUID()}.jpg`;
  await getStorage().bucket().file(path).save(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' });
  const unslotted = await expectFailure(user.call('screenAvatar', { objectId: path.split('/').pop().replace('.jpg', '') }));
  assert.equal(unslotted.details?.reason, 'avatar_not_found');
  assert.equal((await getStorage().bucket().file(path).exists())[0], false);

  const suspended = await newUser();
  await adminDb.collection('profiles').doc(suspended.luid).update({ suspended: true });
  const refused = await expectFailure(suspended.call('beginAvatarUpload', {}));
  assert.equal(refused.code, 'functions/permission-denied');
  assert.equal(refused.details?.reason, 'account_suspended');
  const suspendedPath = `avatars/${suspended.luid}/pending/${randomUUID()}.jpg`;
  await getStorage().bucket().file(suspendedPath).save(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' });
  const screen = await expectFailure(suspended.call('screenAvatar', { objectId: suspendedPath.split('/').pop().replace('.jpg', '') }));
  assert.equal(screen.details?.reason, 'account_suspended');
});

test('avatars: pending uploads nobody screened are deleted after 48 hours', async () => {
  const path = `avatars/${randomUUID()}/pending/${randomUUID()}.jpg`;
  await getStorage().bucket().file(path).save(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' });
  await purgeStalePendingAvatars(Date.now() + 47 * 3_600_000);
  assert.equal((await getStorage().bucket().file(path).exists())[0], true);
  await purgeStalePendingAvatars(Date.now() + 49 * 3_600_000);
  assert.equal((await getStorage().bucket().file(path).exists())[0], false);
});
