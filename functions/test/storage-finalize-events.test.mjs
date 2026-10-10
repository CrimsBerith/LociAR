import assert from 'node:assert/strict';
import test from 'node:test';
import { storageObjectFromNotification } from '../lib/storageFinalizeEvents.js';

const attributes = { eventType: 'OBJECT_FINALIZE', payloadFormat: 'NONE', bucketId: 'demo-bucket',
  objectId: 'post-world-maps/owner/post/map.lociarmap', objectGeneration: '9223372036854775000' };

test('Storage notification preserves the exact generation without reading any message payload', () => {
  const message = { attributes, get json() { throw new Error('Metadata must not be read'); } };
  assert.deepEqual(storageObjectFromNotification(message, 'demo-bucket'), {
    name: attributes.objectId, bucket: attributes.bucketId, generation: attributes.objectGeneration,
  });
});
test('foreign buckets, non-finalize events and metadata payloads cannot enter Storage cleanup', () => {
  for (const patch of [{ bucketId: 'foreign-bucket' }, { eventType: 'OBJECT_DELETE' }, { payloadFormat: 'JSON_API_V1' }]) {
    assert.equal(storageObjectFromNotification({ attributes: { ...attributes, ...patch } }, 'demo-bucket'), null);
  }
  assert.equal(storageObjectFromNotification({}, 'demo-bucket'), null);
});
test('missing, rounded or invalid generation is retryable and cannot cause unconditional deletion', () => {
  for (const patch of [{ objectId: '' }, { objectGeneration: '' }, { objectGeneration: '0' }, { objectGeneration: '-1' }, { objectGeneration: '1.5' }]) {
    assert.throws(() => storageObjectFromNotification({ attributes: { ...attributes, ...patch } }, 'demo-bucket'), /generation is unavailable/);
  }
});
