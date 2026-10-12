import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousGeometry, anonymousIdentity, mayPublishAnonymously } from '../lib/anonymous.js';

test('anonymous identities may publish without granting unverified registered accounts that right', () => {
  const caller = { provider: 'anonymous', isAnonymous: true, isAppleUser: false, emailVerified: false };
  assert.equal(mayPublishAnonymously(caller), true);
  assert.equal(mayPublishAnonymously({ ...caller, isAnonymous: false }), false, 'linked unverified identity stays blocked');
  assert.equal(mayPublishAnonymously({ ...caller, provider: 'password', isAnonymous: false }), false);
  assert.equal(mayPublishAnonymously({ ...caller, isAnonymous: false, emailVerified: true }), true);
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
