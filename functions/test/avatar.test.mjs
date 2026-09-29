import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeSafeSearch } from '../lib/avatarPolicy.js';

test('avatar screening rejects adult, racy, violent images and missing results', () => {
  const clean = { adult: 'VERY_UNLIKELY', racy: 'UNLIKELY', violence: 'VERY_UNLIKELY', medical: 'UNLIKELY' };
  assert.equal(judgeSafeSearch(clean), 'accepted');
  assert.equal(judgeSafeSearch({ ...clean, adult: 'POSSIBLE' }), 'rejected');
  assert.equal(judgeSafeSearch({ ...clean, racy: 'LIKELY' }), 'rejected');
  assert.equal(judgeSafeSearch({ ...clean, violence: 5 }), 'rejected');
  assert.equal(judgeSafeSearch(null), 'rejected');
});
