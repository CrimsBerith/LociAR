import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlausiblePushToken, pushTokenId, utcDay, buildPushMessage, PUSH_DAILY_LIMIT, MAX_TOKENS_PER_USER } from '../lib/push.js';

test('push token validation', () => {
  const real = `${'a'.repeat(22)}:APA91b${'x'.repeat(130)}`;
  assert.equal(isPlausiblePushToken(real), true);
  assert.equal(isPlausiblePushToken('short'), false);
  assert.equal(isPlausiblePushToken('a'.repeat(5000)), false);
  assert.equal(isPlausiblePushToken(`${'a'.repeat(30)} spaces`), false);
  assert.equal(isPlausiblePushToken(`${'a'.repeat(30)}/../x`), false);
  assert.equal(isPlausiblePushToken(undefined), false);
  assert.equal(isPlausiblePushToken(12345678901234567890), false);
});

test('token ids are stable sha256 hex digests', () => {
  assert.match(pushTokenId('abc'), /^[0-9a-f]{64}$/);
  assert.equal(pushTokenId('abc'), pushTokenId('abc'));
  assert.notEqual(pushTokenId('abc'), pushTokenId('abd'));
});

test('daily key follows the UTC day', () => {
  assert.equal(utcDay(Date.UTC(2026, 9, 2, 23, 59, 59)), '20261002');
  assert.equal(utcDay(Date.UTC(2026, 9, 3, 0, 0, 0)), '20261003');
});

test('push message carries the post id the app reads on tap, and clips text', () => {
  const message = buildPushMessage({ title: ` @${'u'.repeat(100)}\n`, body: 'b'.repeat(300), kind: 'like', postId: 'p1' });
  assert.equal(Array.from(message.notification.title).length, 60);
  assert.equal(Array.from(message.notification.body).length, 140);
  assert.deepEqual(message.data, { type: 'like', post_id: 'p1' });
  assert.equal(message.apns.payload.aps.sound, 'default');
  assert.deepEqual(buildPushMessage({ title: '', body: 'x', kind: 'follow' }).data, { type: 'follow' });
  assert.equal(buildPushMessage({ title: '', body: 'x', kind: 'follow' }).notification.title, 'LociAR');
  assert.equal(PUSH_DAILY_LIMIT, 3);
  assert.equal(MAX_TOKENS_PER_USER, 5);
});
