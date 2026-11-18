import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isPostReport, postReceiptId, receiptFor } from '../backfill-report-receipts.mjs';

test('backfill keys match submitReport post receipts and skip comment, filter and anonymous flags', () => {
  const viewer = '11111111-1111-4111-8111-111111111111', post = '22222222-2222-4222-8222-222222222222';
  assert.equal(postReceiptId(viewer, post), createHash('sha256').update(`${viewer}:post:${post}`).digest('hex'));
  const report = receiptFor({ id: 'flag-1', data: { user_id: viewer, post_id: post.toUpperCase(), reason: 'spam', metadata: { target: 'post' } } });
  assert.deepEqual({ ...report, created_at: undefined }, { id: postReceiptId(viewer, post), owner_luid: viewer, target_id: post, flag_id: 'flag-1', created_at: undefined });
  assert.equal(receiptFor({ id: 'c', data: { user_id: viewer, post_id: post, metadata: { comment_id: 'x' } } }), null);
  assert.equal(receiptFor({ id: 'f', data: { user_id: viewer, post_id: post, reason: 'comment_filtered' } }), null);
  assert.equal(receiptFor({ id: 'u', data: { user_id: viewer, post_id: post, metadata: { target: 'user' } } }), null);
  assert.equal(receiptFor({ id: 'n', data: { post_id: post } }), null);
  assert.equal(isPostReport({ metadata: {} }), true);
});
