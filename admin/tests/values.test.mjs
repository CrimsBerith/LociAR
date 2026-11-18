import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalDateTime, scalarText, withStableKeys } from '../lib/values.ts';
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

test('datetime-local values clear when empty and never throw on invalid text', () => {
  assert.deepEqual(parseLocalDateTime(''), { valid: true, iso: null });
  assert.deepEqual(parseLocalDateTime('  '), { valid: true, iso: null });
  assert.deepEqual(parseLocalDateTime('not a date'), { valid: false, iso: null });
  assert.equal(parseLocalDateTime('2026-11-18T12:30').valid, true);
  assert.match(parseLocalDateTime('2026-11-18T12:30').iso, /^2026-11-18T\d{2}:30:00\.000Z$/);
});
