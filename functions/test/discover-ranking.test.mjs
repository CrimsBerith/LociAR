import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverScore, rankForDiscover } from '../lib/discoverRanking.js';

const HOUR = 3_600_000;

test('engagement lifts a post; age decays it', () => {
  assert.ok(discoverScore(30, 24) > discoverScore(0, 1));
  assert.ok(discoverScore(5, 1) > discoverScore(5, 48));
  assert.equal(discoverScore(-9, -3), discoverScore(0, 0));
  assert.equal(discoverScore(Number.NaN, Number.NaN), discoverScore(0, 0));
});

test('ranking is stable on ties and tolerates missing fields', () => {
  const now = 1_800_000_000_000;
  const posts = [
    { id: 'a', e: undefined, t: now - HOUR },
    { id: 'b', e: 0, t: now - HOUR },
    { id: 'c', e: 40, t: now - 2 * HOUR },
    { id: 'd', e: 'x', t: null },
  ];
  const ranked = rankForDiscover(posts, p => ({ engagement: p.e, createdAtMs: p.t }), now).map(p => p.id);
  assert.deepEqual(ranked, ['c', 'd', 'a', 'b']);
});
