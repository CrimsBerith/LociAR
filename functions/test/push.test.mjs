import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidPushTokenCode, pushBody, pushDeliveryId, pushLocale, pushTokenId, validPushToken } from '../lib/pushPolicy.js';

test('FCM tokens reject whitespace, non-ASCII and excessive lengths', () => {
  assert.equal(validPushToken('x'.repeat(20)), true);
  for (const token of [null, 123, '', 'short', 'x'.repeat(4097), 'x'.repeat(20) + '\n', 'x'.repeat(20) + ' ', 'é'.repeat(20)]) {
    assert.equal(validPushToken(token), false);
  }
});

test('token and delivery identifiers are safe document keys without exposing the token', () => {
  const token = 'synthetic/token:with-specials-12345';
  assert.match(pushTokenId(token), /^[a-f0-9]{64}$/);
  assert.ok(!pushTokenId(token).includes(token));
  assert.notEqual(pushDeliveryId('first', pushTokenId(token)), pushDeliveryId('second', pushTokenId(token)));
});

test('only token-specific FCM errors invalidate a registration', () => {
  assert.equal(invalidPushTokenCode('messaging/registration-token-not-registered'), true);
  assert.equal(invalidPushTokenCode('messaging/invalid-registration-token'), true);
  for (const code of ['messaging/invalid-argument', 'messaging/internal-error', 'messaging/third-party-auth-error', undefined]) {
    assert.equal(invalidPushTokenCode(code), false);
  }
});

test('push language selection handles device locales and falls back to English', () => {
  assert.equal(pushLocale('tr-TR'), 'tr');
  assert.equal(pushLocale('pt_BR'), 'pt');
  assert.equal(pushLocale('zh-Hans-CN'), 'zh-Hans');
  assert.equal(pushLocale('unknown'), 'en');
  assert.equal(pushLocale(null), 'en');
  assert.equal(pushBody('like', 'tr'), 'Postun beğenildi.');
  assert.equal(pushBody('unknown', 'en'), null);
  for (const locale of ['tr', 'en', 'zh-Hans', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'de', 'ja']) {
    for (const kind of ['like', 'comment', 'follow']) assert.ok(pushBody(kind, locale)?.length > 0);
  }
});
