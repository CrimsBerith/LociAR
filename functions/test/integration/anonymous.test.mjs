import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminAuth, closeClients, expectFailure, newAnonymousUser, newUser, postBody } from './_harness.mjs';
import { onLikeCreated } from '../../lib/triggers.js';
after(closeClients);

test('anonymous publishing keeps review, idempotency, private ownership and author-free projections', async () => {
  const author = await newUser(), viewer = await newUser();
  const body = postBody({ pose: { latitude: -32, longitude: 119, heading: 0, accuracy: 5 } });
  const created = await author.call('createPost', body);
  assert.equal(created.publishStatus, 'pending_review');
  assert.equal((await author.call('createPost', body)).idempotentReplay, true);
  const ref = adminDb.collection('posts').doc(body.clientMutationId);
  assert.equal((await ref.get()).get('creator_id'), author.luid);
  assert.equal((await ref.get()).get('is_anonymous'), true);
  assert.equal((await viewer.call('readPublicContent', { mode: 'single', postId: ref.id })).posts.length, 0);
  await ref.update({ status: 'active', created_at: Timestamp.now() });
  const post = (await viewer.call('readPublicContent', { mode: 'single', postId: ref.id })).posts[0];
  assert.equal(post.creator_id, ref.id); assert.equal(post.creator_handle, null); assert.equal(post.is_anonymous, true);
  assert.equal(JSON.stringify(post).includes(author.luid), false);
  const listed = await viewer.call('readPublicContent', { mode: 'creator', creatorId: author.luid });
  assert.equal(listed.posts.length, 0, 'profile cannot reveal anonymous authorship');
  const own = await author.call('readPublicContent', { mode: 'single', postId: ref.id });
  assert.equal(own.posts[0].creator_id, author.luid);
  await viewer.call('blockPostAuthor', { postId: ref.id });
  assert.equal((await viewer.call('readPublicContent', { mode: 'single', postId: ref.id })).posts.length, 0);
  assert.equal((await expectFailure(viewer.call('readLikeCount', { postId: ref.id }))).code, 'functions/permission-denied');
  assert.equal((await author.call('deleteOwnPost', { postId: ref.id })).removed, true);
});

test('anonymous likes expose a count and an anonymous activity, never a liker or reusable identity', async () => {
  const owner = await newUser(), liker = await newAnonymousUser();
  const postId = randomUUID();
  await adminDb.collection('posts').doc(postId).set({ creator_id: owner.luid, status: 'active', visibility: 'public', age_rating: 'all', created_at: Timestamp.now() });
  const like = { post_id: postId, user_id: liker.luid, created_at: Timestamp.now() };
  await adminDb.collection('likes').doc(`${postId}_${liker.luid}`).set(like);
  await onLikeCreated.run({ id: randomUUID(), data: { data: () => like } });
  assert.equal((await liker.call('readLikeCount', { postId })).count, 1);
  const activity = (await owner.call('readActivity')).items.find(item => item.post_id === postId);
  assert.equal(activity.actor_id, null);
  assert.equal(JSON.stringify(activity).includes(liker.luid), false);
  assert.match(activity.id, /^[a-f0-9]{64}$/);
  await owner.call('markActivityRead', { activityIds: [activity.id] });
  assert.ok((await owner.call('readActivity')).items.find(item => item.id === activity.id).read_at);
  assert.equal((await expectFailure(liker.call('readActivity', { cursor: activity.id }))).code, 'functions/invalid-argument');
});

test('an anonymous identity can delete its account and posts without a nonexistent password', async () => {
  const user = await newAnonymousUser();
  await adminDb.collection('anonymous_blocks').doc(`${user.luid}_${randomUUID()}`).set({ blocker_id: user.luid, blocked_id: randomUUID() });
  assert.deepEqual(await user.call('deleteAccount'), { ok: true });
  await assert.rejects(adminAuth.getUser(user.uid), error => error.code === 'auth/user-not-found');
  assert.equal((await adminDb.collection('profiles').doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('anonymous_blocks').where('blocker_id', '==', user.luid).get()).empty, true);
});

test('guests can browse and like but cannot publish posts or location notes', async () => {
  const guest = await newAnonymousUser();
  const postError = await expectFailure(guest.call('createPost', postBody()));
  assert.equal(postError.code, 'functions/permission-denied');
  assert.equal(postError.details?.reason, 'identity_unverified');
  const noteError = await expectFailure(guest.call('createPlaceNote', {
    clientMutationId: randomUUID(), lat: -31.95, lng: 115.86, source: 'gps', accuracy: 6, text: 'Guest note' }));
  assert.equal(noteError.code, 'functions/permission-denied');
  assert.equal(noteError.details?.reason, 'identity_unverified');
  assert.equal((await adminDb.collection('posts').where('creator_id', '==', guest.luid).get()).size, 0);
});

test('blocks never reveal who wrote an anonymous note', async () => {
  const author = await newUser(), viewer = await newUser(), other = await newUser();
  const pose = { latitude: -33.4 - Math.random() / 100, longitude: 118.4, heading: 0, accuracy: 5 };
  const body = postBody({ pose });
  await author.call('createPost', body);
  const note = adminDb.collection('posts').doc(body.clientMutationId);
  await note.update({ status: 'active', created_at: Timestamp.now() });
  // A legacy attributed post by the same author, next to the anonymous note.
  const attributed = adminDb.collection('posts').doc(randomUUID());
  await attributed.set({ id: attributed.id, creator_id: author.luid, creator_handle: author.handle, is_anonymous: false,
    status: 'active', visibility: 'public', age_rating: 'all', lat: pose.latitude, lng: pose.longitude,
    geohash: (await note.get()).get('geohash'), created_at: Timestamp.now(), caption: 'Attributed',
    pose_json: JSON.stringify({ latitude: pose.latitude, longitude: pose.longitude, heading: 0 }),
    edit_data_json: JSON.stringify({ version: 1, layers: [] }) });
  const surfaces = async user => ({
    profile: (await user.call('readPublicContent', { mode: 'profile', creatorId: author.luid })).profile?.id ?? null,
    eligible: (await user.call('readPublicContent', { mode: 'eligible_authors', authorIds: [author.luid] })).authorIds,
    search: (await user.call('readPublicContent', { mode: 'search_profiles', term: author.handle })).profiles.map(p => p.id),
  });
  const before = await surfaces(viewer);
  assert.equal(before.profile, author.luid);

  // Hiding an anonymous author hides only that author's anonymous notes, only for this viewer.
  await viewer.call('blockPostAuthor', { postId: note.id });
  await viewer.call('blockPostAuthor', { postId: note.id }); // idempotent
  assert.deepEqual(await surfaces(viewer), before, 'profile, eligibility and search must not change after a mute');
  assert.equal((await viewer.call('readPublicContent', { mode: 'single', postId: note.id })).posts.length, 0);
  assert.equal((await viewer.call('readPublicContent', { mode: 'single', postId: attributed.id })).posts.length, 1);
  assert.equal((await expectFailure(viewer.call('blockPostAuthor', { postId: attributed.id }))).code, 'functions/invalid-argument');

  // An identity block never hides the blocked account's anonymous notes or makes their reads fail.
  await adminDb.collection('user_blocks').doc(`${other.luid}_${author.luid}`).set({ blocker_id: other.luid, blocked_id: author.luid, created_at: Timestamp.now() });
  assert.equal((await other.call('readPublicContent', { mode: 'single', postId: note.id })).posts.length, 1);
  assert.equal(typeof (await other.call('readLikeCount', { postId: note.id })).count, 'number');
  await other.call('recordPostView', { postId: note.id });
  const nearby = await other.call('readPublicContent', { mode: 'nearby', latitude: pose.latitude, longitude: pose.longitude, radiusMeters: 50 });
  assert.ok(nearby.posts.some(p => p.id === note.id), 'blocking a profile must not remove its anonymous notes');
  assert.equal(nearby.posts.some(p => p.id === attributed.id), false, 'attributed posts follow the identity block');
  assert.equal((await other.call('readPublicContent', { mode: 'profile', creatorId: author.luid })).profile, null);
});

test('hiding anonymous authors is rate limited per account', async () => {
  const author = await newUser(), viewer = await newUser();
  const body = postBody({ pose: { latitude: -34.15 - Math.random() / 100, longitude: 117.15, heading: 0, accuracy: 5 } });
  await author.call('createPost', body);
  await adminDb.collection('posts').doc(body.clientMutationId).update({ status: 'active', created_at: Timestamp.now() });
  await adminDb.collection('anonymous_block_quota').doc(viewer.luid).set({ owner_luid: viewer.luid, day: { window: Math.floor(Date.now() / 86_400_000), count: 30 } });
  const error = await expectFailure(viewer.call('blockPostAuthor', { postId: body.clientMutationId }));
  assert.equal(error.code, 'functions/resource-exhausted');
  assert.equal(error.details?.reason, 'rate_limited');
  assert.equal((await adminDb.collection('anonymous_blocks').doc(`${viewer.luid}_${author.luid}`).get()).exists, false);
});
