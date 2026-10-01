import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonError, REASONS } from '../lib/errors.js';

test('reasonError keeps code and message and adds a machine-readable reason', () => {
  const error = reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
  assert.equal(error.code, 'failed-precondition');
  assert.equal(error.message, 'Profile missing; call ensureProfile first');
  assert.deepEqual(error.details, { reason: 'profile_missing' });
});

test('every reason is a snake_case identifier the iOS client can match', () => {
  for (const reason of REASONS) assert.match(reason, /^[a-z]+(_[a-z]+)*$/);
});
