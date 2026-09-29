import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreatePostBody, evaluatePlacement } from '../lib/placement.js';

const base = () => ({
  clientMutationId: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  pose: { latitude: 41.0, longitude: 29.0, heading: 10, accuracy: 8 },
  refImageUri: 'native-ar-reference://pending',
  editData: { version: 1, layers: [{ id: 'x', kind: 'text' }] },
  caption: 'Merhaba',
  ageRating: 'all',
  visibility: 'public',
});

test('rejects 18+, bad caption, missing layers and weak GPS', () => {
  assert.equal(validateCreatePostBody(base()), null);
  assert.match(validateCreatePostBody({ ...base(), ageRating: '18_plus' }), /18\+/);
  assert.equal(validateCreatePostBody({ ...base(), caption: ' ' }), 'Invalid caption');
  assert.equal(validateCreatePostBody({ ...base(), editData: { layers: [] } }), 'At least one edit layer is required');
  assert.match(validateCreatePostBody({ ...base(), pose: { ...base().pose, accuracy: 150 } }), /GPS accuracy/);
  assert.equal(validateCreatePostBody({ ...base(), clientMutationId: 'nope' }), 'Invalid client mutation ID');
});

test('arkit world lock without evidence is rejected', () => {
  const body = base();
  body.pose.anchor = { coordinateSpace: 'arkit_world', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(), nativeAnchorId: 'a' };
  assert.equal(validateCreatePostBody(body), 'Physical AR world lock evidence is incomplete');
});

test('high quality arkit lock with stored world map is auto-publish eligible', async () => {
  const anchorId = '11111111-2222-4333-8444-555555555555';
  const luid = 'aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee';
  const body = base();
  body.pose.anchor = {
    coordinateSpace: 'arkit_world', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    capturedAt: new Date().toISOString(), nativeAnchorId: anchorId, trackingQuality: 'normal',
    surfaceNormal: { x: 0, y: 1, z: 0 }, physicalRectMeters: { width: 0.5, height: 0.5 },
    persistence: { version: 1, kind: 'arkit_world_map', originalNativeAnchorId: anchorId, hostedAt: new Date().toISOString(),
      storagePath: `storage://post-world-maps/${luid}/${body.clientMutationId}/${anchorId}.lociarmap` },
  };
  body.anchorBundle = { coordinateSpace: 'arkit_world', anchor: { id: anchorId, pinQuality: 'planeGeometry', hitSource: 'planeGeometry', trackingQuality: 'normal', worldMappingStatus: 'mapped' } };
  assert.equal(validateCreatePostBody(body), null);
  const seen = [];
  const result = await evaluatePlacement(body, luid, async (p) => { seen.push(p); return p?.startsWith('post-world-maps/') ?? false; });
  assert.ok(seen.includes(`post-world-maps/${luid}/${body.clientMutationId}/${anchorId}.lociarmap`));
  assert.equal(result.placementState, 'arkit_world_locked');
  assert.equal(result.hasPersistentResolver, true);
  assert.equal(result.autoPublishEligible, true);
});

test('only text and social media links are accepted', () => {
  const imageLayer = { ...base(), editData: { layers: [{ id: 'i', type: 'image', uri: 'storage://post-layer-assets/a/b.jpg' }] } };
  assert.match(validateCreatePostBody(imageLayer), /Only text posts/);
  const ownVideo = { ...base(), contentSource: { platform: 'own_video', url: 'storage://post-video-assets/a/b.mp4', mediaKind: 'video' } };
  assert.match(validateCreatePostBody(ownVideo), /Only text posts/);
  const photoLink = { ...base(), contentSource: { platform: 'other', url: 'https://example.com/a.jpg', mediaKind: 'image' } };
  assert.match(validateCreatePostBody(photoLink), /Only text posts/);
  const genericLink = { ...base(), contentSource: { platform: 'other', url: 'https://example.com', mediaKind: 'link' } };
  assert.equal(validateCreatePostBody(genericLink), 'Only social media links are allowed');
  const spotify = { ...base(), contentSource: { platform: 'spotify', url: 'https://open.spotify.com/track/1', mediaKind: 'embed' } };
  assert.equal(validateCreatePostBody(spotify), null);
  const textOnly = { ...base(), contentSource: { platform: 'other', title: 'Merhaba' } };
  assert.equal(validateCreatePostBody(textOnly), null);
});

test('social links must use the platform host over https', () => {
  const link = (platform, url) => ({ ...base(), contentSource: { platform, url, mediaKind: 'embed' } });
  assert.equal(validateCreatePostBody(link('youtube', 'https://youtu.be/abc')), null);
  assert.equal(validateCreatePostBody(link('x', 'https://x.com/user/status/1')), null);
  assert.equal(validateCreatePostBody(link('twitter', 'https://twitter.com/user/status/1')), null);
  assert.equal(validateCreatePostBody(link('spotify', 'https://evil.example/track/1')), 'Invalid social media link');
  assert.equal(validateCreatePostBody(link('spotify', 'https://open.spotify.com.evil.example/track/1')), 'Invalid social media link');
  assert.equal(validateCreatePostBody(link('instagram', 'http://instagram.com/p/1')), 'Invalid social media link');
  assert.equal(validateCreatePostBody(link('facebook', 'https://user:pw@facebook.com/reel/1')), 'Invalid social media link');
});

test('reference image must be a storage path or the pending placeholder', () => {
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'https://tracker.example/pixel.jpg' }), 'Invalid reference image');
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'storage://post-reference-images/a/b/c.jpg' }), null);
});

test('world lock needs only the stored world map; no camera frame is looked up', async () => {
  const anchorId = '21111111-2222-4333-8444-555555555555';
  const luid = 'baaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee';
  const body = { ...base(), refImageUri: 'native-ar-reference://none' };
  body.pose = { ...body.pose, anchor: {
    coordinateSpace: 'arkit_world', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    capturedAt: new Date().toISOString(), nativeAnchorId: anchorId, trackingQuality: 'normal',
    surfaceNormal: { x: 0, y: 1, z: 0 }, physicalRectMeters: { width: 0.5, height: 0.5 },
    persistence: { version: 1, kind: 'arkit_world_map', originalNativeAnchorId: anchorId, hostedAt: new Date().toISOString(),
      storagePath: `storage://post-world-maps/${luid}/${body.clientMutationId}/${anchorId}.lociarmap` },
  } };
  body.anchorBundle = { coordinateSpace: 'arkit_world', anchor: { id: anchorId, pinQuality: 'planeGeometry', hitSource: 'planeGeometry', trackingQuality: 'normal', worldMappingStatus: 'mapped' } };
  assert.equal(validateCreatePostBody(body), null);
  const seen = [];
  const result = await evaluatePlacement(body, luid, async (p) => { seen.push(p); return p?.startsWith('post-world-maps/') ?? false; });
  assert.ok(!seen.some((p) => p?.startsWith('post-reference-images/')), 'reference images are never looked up');
  assert.equal(result.placementState, 'arkit_world_locked');
  assert.deepEqual(result.resolverStrategy, ['native_anchor', 'geo_pose']);
});

test('iOS pins can persist as a Google Cloud Anchor; geospatial poses are validated', async () => {
  const anchorId = '31111111-2222-4333-8444-555555555555';
  const luid = 'caaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee';
  const geospatial = { latitude: 41.0335, longitude: 28.978, altitude: 75.2, eusQuaternion: [0, 0.38, 0, 0.92], horizontalAccuracy: 1.8, verticalAccuracy: 2.5, yawAccuracy: 4 };
  const body = { ...base(), refImageUri: 'native-ar-reference://none' };
  body.pose = { ...body.pose, anchor: {
    coordinateSpace: 'arkit_world', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    capturedAt: new Date().toISOString(), nativeAnchorId: anchorId, trackingQuality: 'normal',
    surfaceNormal: { x: 0, y: 1, z: 0 }, physicalRectMeters: { width: 0.5, height: 0.5 }, geospatial,
    persistence: { version: 1, kind: 'arcore_cloud_anchor', originalNativeAnchorId: anchorId.toUpperCase(), hostedAt: new Date().toISOString(),
      cloudAnchorId: 'ua-a1cc84e4f11b1287d289646811bf54d1', expiresAt: new Date(Date.now() + 364 * 86_400_000).toISOString() },
  } };
  body.anchorBundle = { coordinateSpace: 'arkit_world', anchor: { id: anchorId, pinQuality: 'planeGeometry', hitSource: 'planeGeometry', trackingQuality: 'normal', worldMappingStatus: 'mapped' } };
  assert.equal(validateCreatePostBody(body), null);
  const result = await evaluatePlacement(body, luid, async () => false); // no world map uploaded
  assert.equal(result.hasPersistentResolver, true);
  assert.equal(result.placementState, 'arkit_world_locked');

  const badId = structuredClone(body);
  badId.pose.anchor.persistence.cloudAnchorId = 'bad id!';
  assert.equal(validateCreatePostBody(badId), 'Invalid cloud anchor');
  const vague = structuredClone(body);
  vague.pose.anchor.geospatial.horizontalAccuracy = 40;
  assert.equal(validateCreatePostBody(vague), 'Invalid geospatial pose');
  const expired = structuredClone(body);
  expired.pose.anchor.persistence.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal((await evaluatePlacement(expired, luid, async () => false)).hasPersistentResolver, false);
});
