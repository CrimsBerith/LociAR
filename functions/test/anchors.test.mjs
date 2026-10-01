import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorBindError, anchorDeletable, quotaDecision } from '../lib/anchors.js';

const ME = 'aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee';

test('createPost needs a registered, own, unbound anchor', () => {
  assert.equal(anchorBindError(undefined, ME), 'Cloud anchor is not registered');
  assert.equal(anchorBindError({ owner_luid: 'other', post_id: null }, ME), 'Cloud anchor belongs to another user');
  assert.equal(anchorBindError({ owner_luid: ME, post_id: 'p1' }, ME), 'Cloud anchor is already in use');
  assert.equal(anchorBindError({ owner_luid: ME, post_id: null }, ME), null);
});

test('delete paths only touch an anchor bound to that post', () => {
  assert.equal(anchorDeletable(undefined, 'p1'), false);
  assert.equal(anchorDeletable({ owner_luid: ME, post_id: null }, 'p1'), false);
  assert.equal(anchorDeletable({ owner_luid: ME, post_id: 'p2' }, 'p1'), false);
  assert.equal(anchorDeletable({ owner_luid: ME, post_id: 'p1' }, 'p1'), true);
});

test('quota decision limits at 10/hour and 50/day', () => {
  assert.equal(quotaDecision(9, 49), 'ok');
  assert.equal(quotaDecision(10, 0), 'limited');
  assert.equal(quotaDecision(0, 50), 'limited');
});
