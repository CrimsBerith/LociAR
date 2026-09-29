import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb, closeClients, expectFailure, newUser, postBody } from './_harness.mjs';

before(async () => {
  // Must exist before the first createPost: the function caches protected zones for 5 minutes.
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

test('createPost: only real social links, text and no photos are accepted', async () => {
  const user = await newUser();
  const link = (platform, url) => postBody({ contentSource: { platform, url, mediaKind: 'embed' } });
  const spoofed = await expectFailure(user.call('createPost', link('spotify', 'https://evil.example/track/1')));
  assert.equal(spoofed.code, 'functions/invalid-argument');
  assert.match(spoofed.message, /Invalid social media link/);
  const photo = await expectFailure(user.call('createPost', postBody({
    editData: { version: 1, layers: [{ id: 'i', type: 'image', uri: 'storage://post-layer-assets/a/b.jpg' }] },
  })));
  assert.match(photo.message, /Only text posts/);
  const ok = await user.call('createPost', link('youtube', 'https://youtu.be/dQw4w9WgXcQ'));
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
