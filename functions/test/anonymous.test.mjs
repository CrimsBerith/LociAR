import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousGeometry, anonymousIdentity, mayPublishAnonymously, publicEditData } from '../lib/anonymous.js';

test('only verified Apple or email identities may publish; guests and unverified accounts may not', () => {
  const guest = { provider: 'anonymous', isAnonymous: true, isAppleUser: false, emailVerified: false };
  assert.equal(mayPublishAnonymously(guest), false, 'guests browse, like, report and block only');
  assert.equal(mayPublishAnonymously({ ...guest, isAnonymous: false }), false, 'linked unverified identity stays blocked');
  assert.equal(mayPublishAnonymously({ ...guest, provider: 'password', isAnonymous: false }), false);
  assert.equal(mayPublishAnonymously({ ...guest, provider: 'password', isAnonymous: false, emailVerified: true }), true);
  assert.equal(mayPublishAnonymously({ ...guest, provider: 'apple.com', isAnonymous: false, isAppleUser: true }), true);
});
test('public edit data drops legacy media and hidden owner metadata while preserving drawings and GIFs', () => {
  const source = { version: 1, surfaceTextureUri: 'storage://owner/texture', creator_id: 'owner', layers: [
    { id: 'text', type: 'text', text: 'Keep this note', uri: 'storage://owner/text', owner: 'owner' },
    { id: 'image', type: 'image', uri: 'storage://owner/photo' },
    { id: 'drawing', type: 'drawing', points: [{ x: 1, y: 2, owner: 'owner' }] },
    { id: 'gif', type: 'gif', gifId: 'Valid123', width: 200, height: 300 },
  ] };
  const projected = publicEditData(source);
  assert.equal(JSON.stringify(projected).includes('owner'), false);
  assert.equal(projected.layers.length, 3);
  assert.deepEqual(projected.layers[1].points, [{ x: 1, y: 2 }]);
  assert.equal(projected.layers[2].gifId, 'Valid123');
  assert.equal(source.layers.length, 4, 'projection never mutates the server source');
});
test('each anonymous post exposes its own alias, never the author account or handle', () => {
  assert.deepEqual(anonymousIdentity('post-a', 'secret-owner', 'viewer', true), { creator_id: 'post-a', creator_handle: null, is_anonymous: true });
  assert.equal(anonymousIdentity('post-b', 'secret-owner', 'viewer', true).creator_id, 'post-b');
  assert.equal(anonymousIdentity('post-a', 'owner', 'owner', true).creator_id, 'owner', 'own deletion still works');
});
test('anonymous AR geometry cannot leak account paths or permanent URLs, and Cloud Anchors survive', () => {
  const result = anonymousGeometry({ anchor: { persistence: {
    storagePath: 'storage://post-world-maps/secret-owner/post/map.lociarmap',
    assetURI: 'storage://post-world-maps/secret-owner/post/map.lociarmap',
    assetURL: 'https://download/secret-owner', referenceImageURI: 'storage://secret-owner/frame',
    cloudAnchorId: 'cloud-anchor-123',
  } } }, 'post');
  assert.equal(JSON.stringify(result).includes('secret-owner'), false);
  assert.equal(result.anchor.persistence.assetURI, 'anonymous-world-map://post');
  assert.equal(result.anchor.persistence.cloudAnchorId, 'cloud-anchor-123');
});
