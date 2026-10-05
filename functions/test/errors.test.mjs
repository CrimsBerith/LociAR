import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonError, REASONS, withContentionGuard } from '../lib/errors.js';

test('reasonError keeps code and message and adds a machine-readable reason', () => {
  const error = reasonError('failed-precondition', 'Profile missing; call ensureProfile first', 'profile_missing');
  assert.equal(error.code, 'failed-precondition');
  assert.equal(error.message, 'Profile missing; call ensureProfile first');
  assert.deepEqual(error.details, { reason: 'profile_missing' });
});

test('every reason is a snake_case identifier the iOS client can match', () => {
  for (const reason of REASONS) assert.match(reason, /^[a-z]+(_[a-z]+)*$/);
});

test('withContentionGuard turns transaction lock contention into a retryable busy_retry', async () => {
  const aborted = Object.assign(new Error('10 ABORTED: Transaction lock timeout.'), { code: 10 });
  await assert.rejects(withContentionGuard(async () => { throw aborted; }), (error) => {
    assert.equal(error.code, 'unavailable');
    assert.deepEqual(error.details, { reason: 'busy_retry' });
    return true;
  });
  // Other errors and HttpsErrors pass through unchanged; results are returned as is.
  const other = new Error('boom');
  await assert.rejects(withContentionGuard(async () => { throw other; }), (error) => error === other);
  const denied = reasonError('resource-exhausted', 'limit', 'rate_limited');
  await assert.rejects(withContentionGuard(async () => { throw denied; }), (error) => error === denied);
  assert.equal(await withContentionGuard(async () => 42), 42);
});
