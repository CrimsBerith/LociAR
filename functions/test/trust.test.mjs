import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedAuthor, hasDrawingLayer, TRUST_MIN_ACCOUNT_AGE_MS, TRUST_MIN_PUBLIC_POSTS } from '../lib/trust.js';

const now = Date.UTC(2026, 10, 1);
const ok = { accountCreatedAtMs: now - TRUST_MIN_ACCOUNT_AGE_MS, publicPostCount: TRUST_MIN_PUBLIC_POSTS, hasFlaggedPost: false, trustRevoked: false };

test('trusted author needs age, approved posts, no flagged post and no revocation', () => {
  assert.equal(isTrustedAuthor(ok, now), true);
  assert.equal(isTrustedAuthor({ ...ok, accountCreatedAtMs: now - TRUST_MIN_ACCOUNT_AGE_MS + 1 }, now), false);
  assert.equal(isTrustedAuthor({ ...ok, accountCreatedAtMs: null }, now), false);
  assert.equal(isTrustedAuthor({ ...ok, publicPostCount: TRUST_MIN_PUBLIC_POSTS - 1 }, now), false);
  assert.equal(isTrustedAuthor({ ...ok, hasFlaggedPost: true }, now), false);
  assert.equal(isTrustedAuthor({ ...ok, trustRevoked: true }, now), false);
});

test('drawings are detected by layer type or kind', () => {
  assert.equal(hasDrawingLayer({ layers: [{ type: 'text' }, { type: 'drawing' }] }), true);
  assert.equal(hasDrawingLayer({ layers: [{ kind: 'drawing' }] }), true);
  assert.equal(hasDrawingLayer({ layers: [{ type: 'text' }] }), false);
  assert.equal(hasDrawingLayer(null), false);
  assert.equal(hasDrawingLayer({}), false);
});
