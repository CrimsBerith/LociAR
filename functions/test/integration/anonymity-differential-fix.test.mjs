import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, expectFailure, newUser } from './_harness.mjs';
import { onLikeCreated } from '../../lib/triggers.js';

after(closeClients);

test('anonymity differential: mute and profile blocks remain strictly isolated across feeds and cursors', async () => {
  const author = await newUser(), viewerA = await newUser(), viewerB = await newUser();

  // Create 51 anonymous posts for author
  const batch = adminDb.batch();
  const anonPostIds = [];
  const baseTime = Date.now() - 100_000;
  for (let i = 0; i < 51; i++) {
    const id = randomUUID();
    anonPostIds.push(id);
    batch.set(adminDb.collection('posts').doc(id), {
      id,
      creator_id: author.luid,
      creator_handle: '',
      is_anonymous: true,
      status: 'active',
      visibility: 'public',
      age_rating: 'all',
      lat: 41.0 + i * 0.0001,
      lng: 29.0,
      geohash: 'sxk97',
      created_at: Timestamp.fromMillis(baseTime + i * 1000),
      caption: `Anon note ${i}`,
      pose_json: JSON.stringify({ latitude: 41.0, longitude: 29.0, heading: 0 }),
      edit_data_json: JSON.stringify({ version: 1, layers: [] }),
    });
  }
  await batch.commit();

  // ViewerA mutes author's anonymous notes
  await adminDb.collection('anonymous_blocks').doc(`${viewerA.luid}_${author.luid}`).set({
    blocker_id: viewerA.luid,
    blocked_id: author.luid,
    created_at: Timestamp.now(),
  });

  // ViewerB profile-blocks author
  await adminDb.collection('user_blocks').doc(`${viewerB.luid}_${author.luid}`).set({
    blocker_id: viewerB.luid,
    blocked_id: author.luid,
    created_at: Timestamp.now(),
  });

  // 1. Both viewers querying author's creator feed see empty posts and null next cursor (no leakage)
  const feedA = await viewerA.call('readPublicContent', { mode: 'creator', creatorId: author.luid });
  const feedB = await viewerB.call('readPublicContent', { mode: 'creator', creatorId: author.luid });
  assert.equal(feedA.posts.length, 0);
  assert.equal(feedA.next, null);
  assert.equal(feedB.posts.length, 0);
  assert.equal(feedB.next, null);

  // Author querying own feed sees own anonymous posts with cursor
  const feedAuthor = await author.call('readPublicContent', { mode: 'creator', creatorId: author.luid });
  assert.equal(feedAuthor.posts.length, 50);
  assert.ok(feedAuthor.next);

  // 2. Profile blocks do not drop anonymous notes from single
  const singlePostId = anonPostIds[0];
  const postForB = await viewerB.call('readPublicContent', { mode: 'single', postId: singlePostId });
  assert.equal(postForB.posts.length, 1);
  assert.equal(postForB.posts[0].id, singlePostId);

  // But anonymous mute drops the note for ViewerA
  const postForA = await viewerA.call('readPublicContent', { mode: 'single', postId: singlePostId });
  assert.equal(postForA.posts.length, 0);

  // 3. Activity ID is opaque act_ UUID and actor_id is null for anonymous likes
  const likeData = { post_id: singlePostId, user_id: viewerA.luid, created_at: Timestamp.now() };
  await adminDb.collection('likes').doc(`${singlePostId}_${viewerA.luid}`).set(likeData);
  await onLikeCreated.run({ id: randomUUID(), data: { data: () => likeData } });

  const authorActivity = await author.call('readActivity');
  const likeEvent = authorActivity.items.find(item => item.post_id === singlePostId && item.kind === 'like');
  assert.ok(likeEvent);
  assert.equal(likeEvent.actor_id, null);
  assert.match(likeEvent.id, /^act_[0-9a-f-]{36}$/);
  assert.equal(likeEvent.id.includes(viewerA.luid), false);
  assert.equal(likeEvent.id.includes(author.luid), false);

  // 4. markActivityRead: foreign and missing IDs return identical empty response
  const markForeign = await viewerB.call('markActivityRead', { activityIds: [likeEvent.id] });
  const markMissing = await viewerB.call('markActivityRead', { activityIds: [`act_${randomUUID()}`] });
  assert.deepEqual(markForeign.activities, []);
  assert.deepEqual(markMissing.activities, []);
});
