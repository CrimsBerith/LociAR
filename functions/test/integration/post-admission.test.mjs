import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, expectFailure, newUser, postBody } from './_harness.mjs';
import { encodeGeohash } from '../../lib/geo.js';

after(closeClients);
const pose = (latitude, longitude) => ({ latitude, longitude, heading: 0, accuracy: 5 });
const quota = (luid, period) => adminDb.collection('post_quota').doc(`${luid}_${period}${Math.floor(Date.now() / (period === 'h' ? 3_600_000 : 86_400_000))}`);

async function seedPosts(points) {
  const refs = points.map(() => adminDb.collection('posts').doc(randomUUID()));
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = adminDb.batch();
    refs.slice(offset, offset + 400).forEach((ref, i) => {
      const point = points[offset + i];
      batch.set(ref, { id: ref.id, creator_id: randomUUID(), status: 'active', visibility: 'public', age_rating: 'all',
        lat: point.latitude, lng: point.longitude, geohash: encodeGeohash(point.latitude, point.longitude, 10), deleted_at: null });
    });
    await batch.commit();
  }
  return refs;
}

test('createPost: two users racing for the fifth nearby slot commit exactly one post and one quota', async () => {
  const spot = pose(42.2, 32.2);
  await seedPosts(Array.from({ length: 4 }, () => spot));
  const users = await Promise.all([newUser(), newUser()]);
  const bodies = users.map(() => postBody({ pose: spot }));
  const results = await Promise.allSettled(users.map((user, i) => user.call('createPost', bodies[i])));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const refused = results.find((result) => result.status === 'rejected');
  assert.equal(refused.reason.code, 'functions/resource-exhausted');
  for (let i = 0; i < users.length; i++) {
    const committed = results[i].status === 'fulfilled';
    assert.equal((await adminDb.collection('posts').doc(bodies[i].clientMutationId).get()).exists, committed);
    assert.equal(Number((await quota(users[i].luid, 'h').get()).data()?.count ?? 0), committed ? 1 : 0);
    assert.equal(Number((await quota(users[i].luid, 'd').get()).data()?.count ?? 0), committed ? 1 : 0);
  }
});

test('createPost: nearby parallel inserts across a geohash boundary cannot exceed five', async () => {
  const boundary = 180 / 2 ** 17;
  const south = pose(boundary - 0.00002, 22);
  const north = pose(boundary + 0.00002, 22);
  assert.notEqual(encodeGeohash(south.latitude, south.longitude, 7), encodeGeohash(north.latitude, north.longitude, 7));
  await seedPosts(Array.from({ length: 3 }, () => south));
  const users = await Promise.all(Array.from({ length: 4 }, () => newUser()));
  const results = await Promise.allSettled(users.map((user, i) => user.call('createPost', postBody({ pose: i % 2 ? north : south }))));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  for (const result of results.filter((result) => result.status === 'rejected')) assert.equal(result.reason.code, 'functions/resource-exhausted');
});

test('createPost: the longitude seam is one nearby area for concurrent users', async () => {
  const east = pose(-12, 179.99999);
  const west = pose(-12, -179.99999);
  await seedPosts(Array.from({ length: 4 }, () => east));
  const users = await Promise.all([newUser(), newUser()]);
  const results = await Promise.allSettled(users.map((user, i) => user.call('createPost', postBody({ pose: i ? west : east }))));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'functions/resource-exhausted');
});

test('createPost: density checks continue beyond a full page of farther posts in the same geohash cell', async () => {
  const spot = pose(5.0012, 20.0012);
  const far = pose(5.00035, 20.0007);
  assert.equal(encodeGeohash(spot.latitude, spot.longitude, 7), encodeGeohash(far.latitude, far.longitude, 7));
  assert.ok(encodeGeohash(far.latitude, far.longitude, 10) < encodeGeohash(spot.latitude, spot.longitude, 10));
  await seedPosts([...Array.from({ length: 100 }, () => far), ...Array.from({ length: 5 }, () => spot)]);
  const user = await newUser();
  const body = postBody({ pose: spot });
  const error = await expectFailure(user.call('createPost', body));
  assert.equal(error.code, 'functions/resource-exhausted');
  assert.equal((await adminDb.collection('posts').doc(body.clientMutationId).get()).exists, false);
  assert.equal(Number((await quota(user.luid, 'h').get()).data()?.count ?? 0), 0);
});

test('createPost: concurrent replay with the same anchor commits once without consuming extra quota', async () => {
  const user = await newUser();
  const cloudAnchorId = `ua-${randomUUID().replaceAll('-', '')}`;
  await user.call('registerCloudAnchor', { cloudAnchorId });
  const body = postBody({ pose: { ...pose(42.8, 33.8), anchor: {
    coordinateSpace: 'visual_surface', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(),
    persistence: { kind: 'arcore_cloud_anchor', cloudAnchorId, version: 1, originalNativeAnchorId: 'x', hostedAt: new Date().toISOString() },
  } } });
  const responses = await Promise.all(Array.from({ length: 3 }, () => user.call('createPost', body)));
  assert.equal(responses.filter((response) => response.idempotentReplay === false).length, 1);
  assert.equal(responses.filter((response) => response.idempotentReplay === true).length, 2);
  assert.equal((await quota(user.luid, 'h').get()).data().count, 1);
  assert.equal((await quota(user.luid, 'd').get()).data().count, 1);
  assert.equal((await adminDb.collection('cloud_anchors').doc(cloudAnchorId).get()).data().post_id, body.clientMutationId);
});

test('createPost: two post IDs racing for one anchor leave exactly one binding and one quota', async () => {
  const user = await newUser();
  const cloudAnchorId = `ua-${randomUUID().replaceAll('-', '')}`;
  await user.call('registerCloudAnchor', { cloudAnchorId });
  const bodies = Array.from({ length: 2 }, () => postBody({ pose: { ...pose(43.1, 34.1), anchor: {
    coordinateSpace: 'visual_surface', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(),
    persistence: { kind: 'arcore_cloud_anchor', cloudAnchorId, version: 1, originalNativeAnchorId: 'x', hostedAt: new Date().toISOString() },
  } } }));
  const outcomes = await Promise.allSettled(bodies.map((body) => user.call('createPost', body)));
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((result) => result.status === 'rejected').reason.code, 'functions/invalid-argument');
  const winner = outcomes.findIndex((result) => result.status === 'fulfilled');
  assert.equal((await adminDb.collection('cloud_anchors').doc(cloudAnchorId).get()).data().post_id, bodies[winner].clientMutationId);
  assert.equal((await quota(user.luid, 'h').get()).data().count, 1);
  assert.equal((await quota(user.luid, 'd').get()).data().count, 1);
});

test('createPost: newly activated/deactivated protected zones apply on the next request', async () => {
  const user = await newUser();
  const spot = pose(13.5, 31.5);
  const ref = adminDb.collection('protected_zones').doc(`fresh-${randomUUID()}`);
  try {
    await user.call('createPost', postBody({ pose: spot }));
    await ref.set({ name: 'New zone', category: 'test', lat: spot.latitude, lng: spot.longitude, radius_meters: 100, active: true });
    const denied = await expectFailure(user.call('createPost', postBody({ pose: spot })));
    assert.equal(denied.details?.reason, 'protected_zone');
    await ref.update({ active: false });
    assert.equal((await user.call('createPost', postBody({ pose: spot }))).publishStatus, 'pending_review');
  } finally { await ref.delete(); }
});

test('createPost: an active protected zone after 5,000 earlier records still hard-blocks', { timeout: 120_000 }, async () => {
  const refs = Array.from({ length: 5000 }, (_, i) => adminDb.collection('protected_zones').doc(`bulk-zone-${String(i).padStart(5, '0')}`));
  const blocking = adminDb.collection('protected_zones').doc('zz-last-blocking-zone');
  try {
    for (let offset = 0; offset < refs.length; offset += 400) {
      const batch = adminDb.batch();
      for (const ref of refs.slice(offset, offset + 400)) batch.set(ref, { name: 'Far zone', category: 'test', lat: -35, lng: 60, radius_meters: 1, active: true });
      await batch.commit();
    }
    await blocking.set({ name: 'Last zone', category: 'test', lat: 12.5, lng: 31.5, radius_meters: 100, active: true });
    const user = await newUser();
    const denied = await expectFailure(user.call('createPost', postBody({ pose: pose(12.5, 31.5) })));
    assert.equal(denied.details?.reason, 'protected_zone');
    assert.match(denied.message, /Last zone/);
  } finally {
    for (let offset = 0; offset < refs.length; offset += 400) {
      const batch = adminDb.batch();
      for (const ref of refs.slice(offset, offset + 400)) batch.delete(ref);
      await batch.commit();
    }
    await blocking.delete();
  }
});

test('createPost: malformed active zone geometry fails closed without creating a post', async () => {
  const user = await newUser();
  const ref = adminDb.collection('protected_zones').doc(`invalid-${randomUUID()}`);
  const body = postBody({ pose: pose(15, 32) });
  try {
    await ref.set({ name: 'Invalid zone', category: 'test', lat: 91, lng: 32, radius_meters: 100, active: true });
    const denied = await expectFailure(user.call('createPost', body));
    assert.equal(denied.code, 'functions/failed-precondition');
    assert.equal((await adminDb.collection('posts').doc(body.clientMutationId).get()).exists, false);
    assert.equal(Number((await quota(user.luid, 'h').get()).data()?.count ?? 0), 0);
  } finally { await ref.delete(); }
});
