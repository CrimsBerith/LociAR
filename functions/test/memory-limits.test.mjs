import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache, WindowLimiter } from '../lib/memoryLimits.js';
import { postHiddenByBlocks } from '../lib/visibility.js';

test('window limiter allows a fixed number of calls per key and window', () => {
  const limiter = new WindowLimiter(2, 60_000);
  assert.equal(limiter.allow('a', 0), true);
  assert.equal(limiter.allow('a', 1_000), true);
  assert.equal(limiter.allow('a', 2_000), false, 'third call in the same minute is refused');
  assert.equal(limiter.allow('b', 2_000), true, 'keys are independent');
  assert.equal(limiter.allow('a', 60_000), true, 'a new window starts over');
});

test('window limiter refuses new keys at capacity without erasing active budgets', () => {
  const limiter = new WindowLimiter(1, 60_000, 3);
  for (const key of ['a', 'b', 'c']) assert.equal(limiter.allow(key, 0), true);
  assert.equal(limiter.allow('d', 0), false, 'capacity pressure does not reset existing counters');
  assert.equal(limiter.allow('a', 1), false, 'same-window budget is preserved');
  assert.equal(limiter.allow('d', 60_000), true, 'stale windows free capacity');
  assert.equal(limiter.allow('d', 60_001), false);
});

test('ttl cache expires entries and evicts the oldest when full', () => {
  const cache = new TtlCache(2);
  cache.set('a', 1, 1_000, 0);
  cache.set('b', 2, 1_000, 0);
  assert.equal(cache.get('a', 500), 1);
  assert.equal(cache.get('a', 1_000), undefined, 'expired');
  cache.set('c', 3, 1_000, 0);
  cache.set('d', 4, 1_000, 0);
  assert.equal(cache.get('b', 1), undefined, 'oldest evicted');
  assert.equal(cache.get('d', 1), 4);
});

test('identity blocks hide attributed posts only and mutes hide anonymous posts only', () => {
  const blocks = { identity: new Set(['blocked']), muted: new Set(['muted']) };
  assert.equal(postHiddenByBlocks('viewer', 'blocked', false, blocks), true);
  assert.equal(postHiddenByBlocks('viewer', 'blocked', true, blocks), false, 'a profile block must not reveal anonymous authorship');
  assert.equal(postHiddenByBlocks('viewer', 'muted', true, blocks), true);
  assert.equal(postHiddenByBlocks('viewer', 'muted', false, blocks), false, 'a mute must not reveal the account behind a note');
  assert.equal(postHiddenByBlocks('self', 'self', true, { identity: new Set(['self']), muted: new Set(['self']) }), false, 'own posts stay visible');
});
