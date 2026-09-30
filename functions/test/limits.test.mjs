import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpWindow, clampedNext, handleCooldownRemaining, isRecentAuth, HANDLE_COOLDOWN_MS } from '../lib/limits.js';
import { isReservedHandle, handleIsBlocked, anyBlocked } from '../lib/moderation.js';
import { appleConfigFromEnv, appleClientSecret, revokeAppleAuthorization } from '../lib/apple.js';
import { generateKeyPairSync } from 'node:crypto';
import { profileBlock } from '../lib/profileGuard.js';

test('counters never go below zero', () => {
  assert.equal(clampedNext(0, -1), 0);
  assert.equal(clampedNext(undefined, 1), 1);
  assert.equal(clampedNext(5, -3), 2);
  assert.equal(clampedNext('x', 2), 2);
});

test('handle cooldown is 30 days', () => {
  const now = Date.now();
  assert.equal(handleCooldownRemaining(null, now), 0);
  assert.equal(handleCooldownRemaining(now - HANDLE_COOLDOWN_MS - 1, now), 0);
  assert.ok(handleCooldownRemaining(now - 1000, now) > 0);
});

test('window counter allows 5 then blocks, and resets next window', () => {
  let state;
  const t = 10 * 3_600_000;
  for (let i = 0; i < 5; i++) {
    const r = bumpWindow(state, t, 3_600_000, 5);
    assert.equal(r.allowed, true);
    state = r.next;
  }
  assert.equal(bumpWindow(state, t + 1000, 3_600_000, 5).allowed, false);
  assert.equal(bumpWindow(state, t + 3_600_000, 3_600_000, 5).allowed, true);
});

test('recent auth check', () => {
  const now = Date.now();
  assert.equal(isRecentAuth(now / 1000 - 60, now), true);
  assert.equal(isRecentAuth(now / 1000 - 600, now), false);
  assert.equal(isRecentAuth(undefined, now), false);
});

test('reserved and blocked handles', () => {
  assert.equal(isReservedHandle('admin'), true);
  assert.equal(isReservedHandle('lo.ci_ar'), true);
  assert.equal(isReservedHandle('kans'), false);
  assert.equal(handleIsBlocked('fuck_you'), true);
  assert.equal(handleIsBlocked('kans_ar'), false);
  assert.equal(anyBlocked(['merhaba', null, 'siktir git']), true);
  assert.equal(anyBlocked(['merhaba', undefined]), false);
});

test('profileBlock reports missing, deleted and suspended profiles', () => {
  assert.equal(profileBlock(undefined).reason, 'profile_missing');
  assert.equal(profileBlock({ deleted_at: 1 }).reason, 'profile_missing');
  assert.equal(profileBlock({ suspended: true }).reason, 'account_suspended');
  assert.equal(profileBlock({ suspended: false }), null);
});

test('apple revoke: success, and a 400 from Apple aborts with an error', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const config = appleConfigFromEnv({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_CLIENT_ID: 'c.id', APPLE_PRIVATE_KEY: pem });
  assert.ok(config);
  assert.equal(appleConfigFromEnv({}), null);
  assert.equal(appleClientSecret(config, 1000).split('.').length, 3);
  const calls = [];
  const ok = async (url) => { calls.push(url); return new Response(JSON.stringify({ refresh_token: 'r' }), { status: 200 }); };
  await revokeAppleAuthorization(config, 'code', { fetchImpl: ok });
  assert.deepEqual(calls.map((u) => u.split('/').pop()), ['token', 'revoke']);
  const bad = async () => new Response('{}', { status: 400 });
  await assert.rejects(revokeAppleAuthorization(config, 'code', { fetchImpl: bad }), /apple_token_400/);
});
