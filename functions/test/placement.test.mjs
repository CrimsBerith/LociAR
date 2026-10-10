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

test('only text and GIF posts are accepted: no device media and no links of any kind', () => {
  const imageLayer = { ...base(), editData: { layers: [{ id: 'i', type: 'image', uri: 'storage://post-layer-assets/a/b.jpg' }] } };
  assert.equal(validateCreatePostBody(imageLayer), 'Only text and GIF posts are allowed');
  const ownVideo = { ...base(), contentSource: { platform: 'own_video', url: 'storage://post-video-assets/a/b.mp4', mediaKind: 'video' } };
  assert.equal(validateCreatePostBody(ownVideo), 'Only text and GIF posts are allowed');
  const photoLink = { ...base(), contentSource: { platform: 'other', url: 'https://example.com/a.jpg', mediaKind: 'image' } };
  assert.equal(validateCreatePostBody(photoLink), 'Only text and GIF posts are allowed');
  // Social media links were removed on 9 Oct 2026: every platform, host and scheme is refused.
  const link = (platform, url) => ({ ...base(), contentSource: { platform, url, mediaKind: 'embed' } });
  for (const [platform, url] of [
    ['spotify', 'https://open.spotify.com/track/1'],
    ['youtube', 'https://youtu.be/abc'],
    ['tiktok', 'https://www.tiktok.com/@user/video/7300000000000000000'],
    ['instagram', 'https://www.instagram.com/reel/abc/'],
    ['x', 'https://x.com/user/status/1'],
    ['facebook', 'https://www.facebook.com/reel/1'],
    ['other', 'https://example.com'],
    ['text', 'javascript:alert(1)'],
  ]) assert.equal(validateCreatePostBody(link(platform, url)), 'Links are not allowed', platform);
  const textOnly = { ...base(), contentSource: { platform: 'other', title: 'Merhaba' } };
  assert.equal(validateCreatePostBody(textOnly), null);
  assert.equal(validateCreatePostBody({ ...base(), contentSource: null }), null);
  assert.equal(validateCreatePostBody({ ...base(), contentSource: { platform: 'text', url: '' } }), null);
});

test('reference image must be a storage path or the pending placeholder', () => {
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'https://tracker.example/pixel.jpg' }), 'Invalid reference image');
  const luid = 'aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee';
  const own = `storage://post-reference-images/${luid}/${base().clientMutationId}/c.jpg`;
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: own }, luid), null);
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'storage://post-reference-images/other/x/c.jpg' }, luid), 'Invalid reference image');
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'native-ar-reference://../x' }, luid), 'Invalid reference image');
  assert.equal(validateCreatePostBody({ ...base(), refImageUri: 'native-ar-reference://none' }, luid), null);
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

test('surfaceTextureUri is rejected', () => {
  const body = { ...base(), editData: { layers: [{ id: 'x', kind: 'text' }], surfaceTextureUri: 'storage://post-surface-textures/a/b.jpg' } };
  assert.equal(validateCreatePostBody(body), 'Surface textures are not accepted');
  assert.equal(validateCreatePostBody({ ...base(), editData: { layers: [{ id: 'x', kind: 'text' }], surfaceTextureUri: null } }), null);
});

test('client cannot choose placement state, provider or resolver strategy', async () => {
  const body = { ...base(), placementState: 'arkit_world_locked', nativeProvider: 'admin', resolverStrategy: ['x'] };
  const r = await evaluatePlacement(body, 'aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee', async () => false);
  assert.equal(r.placementState, 'free_space_approximate');
  assert.equal(r.nativeProvider, null);
  assert.deepEqual(r.resolverStrategy, ['geo_pose']);
});

test('admin_geo_estimate coordinate space is rejected from clients', () => {
  const body = base();
  body.pose.anchor = { coordinateSpace: 'admin_geo_estimate', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString(), nativeAnchorId: 'a' };
  assert.equal(validateCreatePostBody(body), 'Invalid coordinate space');
});

test('one GIPHY GIF is accepted by id only; drawings are refused', () => {
  const withLayers = (layers) => ({ ...base(), editData: { version: 1, layers } });
  const gif = (gifId, extra = {}) => ({ id: 'g', type: 'gif', gifId, ...extra });
  assert.equal(validateCreatePostBody(withLayers([gif('3o7aCSPqXE5C6T8tBC')])), null);
  assert.equal(validateCreatePostBody(withLayers([{ id: 't', type: 'text', text: 'Selam' }, gif('l0MYt5jPR6QX5pnqM')])), null);
  assert.equal(validateCreatePostBody(withLayers([gif('a'), gif('b')])), 'Only one GIF is allowed');
  for (const id of ['', 'https://media.giphy.com/media/x/giphy.gif', '../x', 'a b', 'a'.repeat(65), 42, null]) {
    assert.equal(validateCreatePostBody(withLayers([gif(id)])), 'Invalid GIF', String(id));
  }
  assert.equal(validateCreatePostBody(withLayers([gif('abc', { uri: 'https://media.giphy.com/media/abc/giphy.mp4' })])), 'Only text and GIF posts are allowed');
  assert.equal(validateCreatePostBody(withLayers([{ id: 'd', type: 'drawing', color: '#FFFFFF', points: [{ x: 0, y: 0 }] }])), 'Only text and GIF posts are allowed');
});

test('layer shape limits', () => {
  const withLayers = (layers) => ({ ...base(), editData: { version: 1, layers } });
  const stroke = (n, extra = {}) => ({ id: 'd', type: 'drawing', color: '#FFFFFF', points: Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5 })), ...extra });
  assert.equal(validateCreatePostBody(withLayers([stroke(2001)])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([stroke(2000), stroke(2000), stroke(1)])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([{ id: 'd', type: 'drawing', points: [{ x: 'a', y: 1 }] }])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([{ id: 'd', type: 'drawing', points: [{ x: 1e9, y: 1 }] }])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([{ id: 'd', type: 'drawing', points: [{ x: null, y: 1 }] }])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([{ id: 'd', type: 'drawing', points: 'x' }])), 'Invalid drawing');
  assert.equal(validateCreatePostBody(withLayers([stroke(5, { color: 'red' })])), 'Invalid layer color');
  assert.equal(validateCreatePostBody(withLayers([{ id: 't', type: 'text', text: 'a'.repeat(1001) }])), 'Layer text is too long');
  assert.equal(validateCreatePostBody(withLayers(Array.from({ length: 21 }, (_, i) => ({ id: `t${i}`, type: 'text', text: 'x' })))), 'Too many edit layers');
});
