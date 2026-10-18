import test from 'node:test';
import assert from 'node:assert/strict';
import { scalarText } from '../lib/values.ts';
import { isEmailAddress } from '../lib/validation.ts';

test('untrusted objects cannot supply display text through coercion', () => {
  assert.equal(scalarText({ toString() { throw new Error('untrusted coercion'); } }), '');
  assert.equal(scalarText('hello'), 'hello');
  assert.equal(scalarText(12), '12');
  assert.equal(scalarText(null), '');
});

test('email shape checking rejects malformed and oversized addresses without regex backtracking', () => {
  for (const value of ['person@example.test', ' person@example.test ']) assert.equal(isEmailAddress(value), true);
  for (const value of ['', null, {}, 'person@@example.test', 'person@example', '@example.test', 'p@.test', 'p@example.', 'a'.repeat(254) + '@b.test']) {
    assert.equal(isEmailAddress(value), false);
  }
});
