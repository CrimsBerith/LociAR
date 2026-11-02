import test from 'node:test';
import assert from 'node:assert/strict';
import { scalarText, withStableKeys } from '../lib/values.ts';
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

test('display keys survive reordering and distinguish duplicate values', () => {
  const before = withStableKeys(['first', 'second', 'first'], value => value);
  const after = withStableKeys(['second', 'first', 'first'], value => value);
  assert.equal(before[1].key, after[0].key);
  assert.equal(before[0].key, after[1].key);
  assert.equal(new Set(before.map(item => item.key)).size, 3);
});
