import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInviteCode, normalizeInviteCode, inviteGate, attemptState, INVITES_PER_USER, MAX_FAILED_REDEEMS_PER_HOUR,
} from '../lib/invites.js';

test('generated codes are 8 characters from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateInviteCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(normalizeInviteCode(code), code);
  }
  let n = 0;
  assert.equal(generateInviteCode(() => n++ % 32), 'ABCDEFGH');
});

test('normalizeInviteCode accepts case, spaces and hyphens, and rejects the rest', () => {
  assert.equal(normalizeInviteCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(normalizeInviteCode('abcd efgh'), 'ABCDEFGH');
  assert.equal(normalizeInviteCode('ABCDEFG'), null);
  assert.equal(normalizeInviteCode('ABCDEFGHJ'), null);
  assert.equal(normalizeInviteCode('ABCDEFG0'), null);
  assert.equal(normalizeInviteCode('ABCDEFGI'), null);
  assert.equal(normalizeInviteCode('ABCDEFG!'), null);
  assert.equal(normalizeInviteCode(12345678), null);
  assert.equal(normalizeInviteCode(undefined), null);
  assert.equal(normalizeInviteCode('A'.repeat(41)), null);
});

test('publishing is gated only when required, unless redeemed or exempt', () => {
  assert.equal(inviteGate(undefined, false), null);
  assert.equal(inviteGate(undefined, true), 'invite_required');
  assert.equal(inviteGate({}, true), 'invite_required');
  assert.equal(inviteGate({ invite_redeemed_at: new Date() }, true), null);
  assert.equal(inviteGate({ invite_exempt: true }, true), null);
  assert.equal(inviteGate({ invite_exempt: false }, true), 'invite_required');
});

test('failed redeem attempts reset after an hour', () => {
  const now = 10_000_000;
  assert.deepEqual(attemptState(undefined, now), { windowStart: now, count: 0 });
  assert.deepEqual(attemptState({ window_start: now - 1000, count: 4 }, now), { windowStart: now - 1000, count: 4 });
  assert.deepEqual(attemptState({ window_start: now - 3_600_000, count: 9 }, now), { windowStart: now, count: 0 });
  assert.equal(MAX_FAILED_REDEEMS_PER_HOUR, 10);
  assert.equal(INVITES_PER_USER, 3);
});
