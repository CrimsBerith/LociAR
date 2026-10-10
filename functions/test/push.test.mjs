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

test('daily engagement cap counts activities, not devices, and is per UTC day', async () => {
  const { pushQuotaDecision, pushQuotaId, utcDay, PUSH_DAILY_LIMIT } = await import('../lib/pushPolicy.js');
  assert.equal(PUSH_DAILY_LIMIT, 3);
  let stored;
  for (const id of ['a1', 'a2', 'a3']) {
    const decision = pushQuotaDecision(stored, id);
    assert.equal(decision.allow, true);
    stored = decision.next;
  }
  assert.deepEqual(stored, { count: 3, activity_ids: ['a1', 'a2', 'a3'] });
  // A second device of an already counted activity is still delivered, without a new slot.
  assert.deepEqual(pushQuotaDecision(stored, 'a2'), { allow: true });
  assert.deepEqual(pushQuotaDecision(stored, 'a4'), { allow: false });
  assert.deepEqual(pushQuotaDecision({ count: 'x', activity_ids: [1, 'b'] }, 'c').next, { count: 2, activity_ids: ['b', 'c'] });
  assert.equal(utcDay(Date.UTC(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.notEqual(pushQuotaId('u', Date.UTC(2026, 9, 9, 23, 59)), pushQuotaId('u', Date.UTC(2026, 9, 10, 0, 1)));
});

test('post approval text exists for every app language and falls back to English', async () => {
  const { postApprovedBody } = await import('../lib/pushPolicy.js');
  assert.equal(postApprovedBody('tr-TR'), 'Postun onaylandı ve yayında.');
  assert.equal(postApprovedBody('xx'), 'Your post was approved and is now live.');
  for (const locale of ['tr', 'en', 'zh-Hans', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'de', 'ja']) {
    assert.ok(postApprovedBody(locale).length > 0, locale);
  }
});
