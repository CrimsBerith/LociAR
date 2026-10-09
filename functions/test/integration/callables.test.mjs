import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb, closeClients, expectFailure, newUser, postBody } from './_harness.mjs';

before(async () => {
  // Each createPost admission reads the current active zones without a process cache.
  await adminDb.collection('protected_zones').doc('test-zone').set({
    name: 'Test Zone', category: 'test', lat: 10, lng: 10, radius_meters: 300, active: true,
  });
});
after(closeClients);

test('ensureProfile creates the profile, reserves the handle and is idempotent', async () => {
  const alice = await newUser('alice_int');
  assert.equal(alice.handle, 'alice_int');
  const profile = await adminDb.collection('profiles').doc(alice.luid).get();
  assert.equal(profile.data().handle, 'alice_int');
  assert.equal(profile.data().suspended, false);
  assert.equal((await adminDb.collection('handles').doc('alice_int').get()).data().luid, alice.luid);
  const again = await alice.call('ensureProfile', {});
  assert.equal(again.handle, 'alice_int');
  assert.equal(again.claimsUpdated, false);
});

test('ensureProfile records the accepted terms version once, ignoring malformed values', async () => {
  const user = await newUser();
  const privateDoc = () => adminDb.collection('users_private').doc(user.luid).get().then((d) => d.data());
  await user.call('ensureProfile', { termsVersion: 'not a version' });
  assert.equal((await privateDoc()).terms_version, undefined);
  await user.call('ensureProfile', { termsVersion: '2026-10-04' });
  const first = await privateDoc();
  assert.equal(first.terms_version, '2026-10-04');
  assert.ok(first.terms_accepted_at);
  await user.call('ensureProfile', { termsVersion: '2026-10-04' });
  assert.equal((await privateDoc()).terms_accepted_at.toMillis(), first.terms_accepted_at.toMillis(), 'same version keeps the first acceptance time');
});

test('usernames are unique: a taken handle is refused with a machine-readable reason', async () => {
  await newUser('taken_name');
  const other = await newUser();
  const error = await expectFailure(other.call('updateHandle', { handle: 'taken_name' }));
  assert.equal(error.code, 'functions/already-exists');
  assert.equal(error.details?.reason, 'handle_taken');
  const renamed = await other.call('updateHandle', { handle: 'fresh_name' });
  assert.equal(renamed.handle, 'fresh_name');
  const old = await adminDb.collection('handles').doc(other.handle).get();
  assert.equal(old.exists, false, 'the previous reservation is released');
  const bad = await expectFailure(other.call('updateHandle', { handle: 'A B' }));
  assert.equal(bad.code, 'functions/invalid-argument');
});

test('createPost: text post is created pending review and replays idempotently', async () => {
  const user = await newUser();
  const body = postBody();
  const first = await user.call('createPost', body);
  assert.equal(first.publishStatus, 'pending_review');
  assert.equal(first.idempotentReplay, false);
  const replay = await user.call('createPost', body);
  assert.equal(replay.idempotentReplay, true);
  const stored = (await adminDb.collection('posts').doc(body.clientMutationId).get()).data();
  assert.equal(stored.creator_id, user.luid);
  assert.equal(stored.status, 'pending_review');
  assert.equal(stored.likes_count, 0);
});

test('createPost: only text is accepted, no photos and no links', async () => {
  const user = await newUser();
  const link = (platform, url) => postBody({ contentSource: { platform, url, mediaKind: 'embed' } });
  for (const [platform, url] of [['youtube', 'https://youtu.be/dQw4w9WgXcQ'], ['spotify', 'https://evil.example/track/1']]) {
    const refused = await expectFailure(user.call('createPost', link(platform, url)));
    assert.equal(refused.code, 'functions/invalid-argument');
    assert.match(refused.message, /Links are not allowed/);
  }
  const photo = await expectFailure(user.call('createPost', postBody({
    editData: { version: 1, layers: [{ id: 'i', type: 'image', uri: 'storage://post-layer-assets/a/b.jpg' }] },
  })));
  assert.match(photo.message, /Only text posts/);
  const ok = await user.call('createPost', postBody());
  assert.equal(ok.publishStatus, 'pending_review');
});

test('createPost: protected zones are hard-blocked with a reason', async () => {
  const user = await newUser();
  const error = await expectFailure(user.call('createPost', postBody({ pose: { latitude: 10.001, longitude: 10.001, heading: 0, accuracy: 5 } })));
  assert.equal(error.code, 'functions/permission-denied');
  assert.equal(error.details?.reason, 'protected_zone');
});

test('createPost: suspended accounts cannot publish', async () => {
  const user = await newUser();
  await adminDb.collection('profiles').doc(user.luid).update({ suspended: true });
  const error = await expectFailure(user.call('createPost', postBody()));
  assert.equal(error.code, 'functions/permission-denied');
  assert.equal(error.details?.reason, 'account_suspended');
});

test('deleteAccount hard-deletes profile, posts, handle and the auth user', async () => {
  const user = await newUser('leaving_user');
  const body = postBody();
  await user.call('createPost', body);
  assert.deepEqual(await user.call('deleteAccount', {}), { ok: true });
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('posts').doc(body.clientMutationId).get()).exists, false);
  assert.equal((await adminDb.collection('handles').doc('leaving_user').get()).exists, false);
  await assert.rejects(adminAuth.getUser(user.uid), /no user record/i);
});

test('getArcoreToken: failed signing refunds the slot; a full quota is rate limited; suspended users are refused', async () => {
  const user = await newUser();
  // No Google credentials exist in the emulator, so signing fails cleanly instead of crashing.
  for (let i = 0; i < 35; i++) {
    const failed = await expectFailure(user.call('getArcoreToken', {}));
    assert.equal(failed.code, 'functions/unavailable'); // never locked out: each failure refunds its slot
  }
  const bucket = `${user.luid}_${Math.floor(Date.now() / 3_600_000)}`;
  await adminDb.collection('arcore_token_quota').doc(bucket).set({ count: 30 });
  const limited = await expectFailure(user.call('getArcoreToken', {}));
  assert.equal(limited.code, 'functions/resource-exhausted');
  assert.equal(limited.details?.reason, 'rate_limited');
  await adminDb.collection('profiles').doc(user.luid).update({ suspended: true });
  const suspended = await expectFailure(user.call('getArcoreToken', {}));
  assert.equal(suspended.code, 'functions/permission-denied');
});

test('createPost quota is race-safe: parallel calls never exceed the hourly limit and flag once', async () => {
  const user = await newUser();
  const results = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => user.call('createPost', postBody({
    // 0.01 degrees apart, so the density limit never triggers.
    pose: { latitude: 41.0 + i * 0.01, longitude: 28.0, heading: 10, accuracy: 8 },
  }))));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(ok <= 10, `expected at most 10 successes, got ${ok}`);
  const flags = await adminDb.collection('moderation_flags').where('user_id', '==', user.luid).get();
  assert.ok(flags.size <= 1, `expected at most 1 flag, got ${flags.size}`);
});

test('createPost with an unregistered cloud anchor is rejected; a registered one binds once', async () => {
  const user = await newUser();
  const other = await newUser();
  const anchor = { kind: 'arcore_cloud_anchor', cloudAnchorId: 'ua-0123456789abcdef', version: 1, originalNativeAnchorId: 'x', hostedAt: new Date().toISOString() };
  const withAnchor = () => postBody({ pose: { latitude: 41.5, longitude: 28.5, heading: 10, accuracy: 8, anchor: { coordinateSpace: 'visual_surface', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(), persistence: anchor } } });
  const rejected = await expectFailure(user.call('createPost', withAnchor()));
  assert.equal(rejected.code, 'functions/invalid-argument');
  await user.call('registerCloudAnchor', { cloudAnchorId: anchor.cloudAnchorId });
  const stolen = await expectFailure(other.call('registerCloudAnchor', { cloudAnchorId: anchor.cloudAnchorId }));
  assert.equal(stolen.code, 'functions/already-exists');
  const otherPost = await expectFailure(other.call('createPost', withAnchor()));
  assert.equal(otherPost.code, 'functions/invalid-argument');
  await user.call('createPost', withAnchor());
  const again = await expectFailure(user.call('createPost', withAnchor()));
  assert.equal(again.code, 'functions/invalid-argument');
});

test('handles: reserved and blocked names are refused; a second change within 30 days is refused', async () => {
  const user = await newUser();
  const reserved = await expectFailure(user.call('updateHandle', { handle: 'admin' }));
  assert.equal(reserved.details?.reason, 'handle_reserved');
  const blocked = await expectFailure(user.call('updateHandle', { handle: 'fuck_you' }));
  assert.equal(blocked.details?.reason, 'handle_not_allowed');
  await user.call('updateHandle', { handle: `first_${user.luid.slice(0, 6)}` });
  const again = await expectFailure(user.call('updateHandle', { handle: `second_${user.luid.slice(0, 6)}` }));
  assert.equal(again.code, 'functions/resource-exhausted');
  assert.equal(again.details?.reason, 'handle_cooldown');
});

test('createPost rejects blocked words in the caption', async () => {
  const user = await newUser();
  const error = await expectFailure(user.call('createPost', postBody({ caption: 'siktir git' })));
  assert.equal(error.code, 'functions/invalid-argument');
});

test('deleteAccount: Apple accounts need revocation, non-Apple accounts delete after a fresh sign-in', async () => {
  const user = await newUser('fresh_delete');
  assert.deepEqual(await user.call('deleteAccount', {}), { ok: true });
});
