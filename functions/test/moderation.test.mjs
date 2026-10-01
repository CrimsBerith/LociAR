import test from 'node:test';
import assert from 'node:assert/strict';
import { containsBlockedTerm } from '../lib/moderation.js';

test('flags blocked words, leet and spaced spellings; ignores normal text', () => {
  assert.equal(containsBlockedTerm('Harika bir yer, tekrar geleceğim!'), false);
  assert.equal(containsBlockedTerm('Göteborg çok güzel'), false);
  assert.equal(containsBlockedTerm('Classic assessment'), false);
  assert.equal(containsBlockedTerm('siktir git'), true);
  assert.equal(containsBlockedTerm('SİKTİR'), true);
  assert.equal(containsBlockedTerm('f u c k this'), true);
  assert.equal(containsBlockedTerm('you b1tch'), true);
});
