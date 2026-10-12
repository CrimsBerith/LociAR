import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminAuth, closeClients, expectFailure, newAnonymousUser, newUser, postBody } from './_harness.mjs';
import { onLikeCreated } from '../../lib/triggers.js';
after(closeClients);

test('anonymous publishing keeps review, idempotency, private ownership and author-free projections', async () => {
  const author = await newAnonymousUser(), viewer = await newUser();
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
