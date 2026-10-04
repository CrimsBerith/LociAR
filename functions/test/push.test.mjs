import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPushMessage, deviceDocId, PUSH_LOC_KEYS } from '../lib/push.js';

test('push messages are localized on the device (APNs loc-key) and carry the post id', () => {
  const message = buildPushMessage('tok-123', 'like', 'ayse', 'p-1');
  assert.equal(message.token, 'tok-123');
  assert.deepEqual(message.apns.payload.aps.alert, { locKey: 'push.like', locArgs: ['@ayse'] });
  assert.deepEqual(message.data, { kind: 'like', post_id: 'p-1' });
  assert.deepEqual(buildPushMessage('t', 'follow', 'x', null).data, { kind: 'follow' });
  assert.deepEqual(Object.values(PUSH_LOC_KEYS).sort(), ['push.comment', 'push.follow', 'push.like']);
});

test('device ids are a hash of the token, never the token itself', () => {
  const id = deviceDocId('secret-token-value');
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(id.includes('secret'), false);
  assert.equal(deviceDocId('secret-token-value'), id);
});
