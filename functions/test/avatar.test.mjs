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
test('SafeSearch is fail-closed for incomplete, unknown and malformed classifications',()=>{
 for(const annotation of[{}, {adult:'UNKNOWN',racy:'UNKNOWN',violence:'UNKNOWN',medical:'UNKNOWN'}, {adult:'VERY_UNLIKELY'}, {adult:-1,racy:1,violence:1,medical:1}, {adult:NaN,racy:1,violence:1,medical:1}])assert.equal(judgeSafeSearch(annotation),'rejected');
});
