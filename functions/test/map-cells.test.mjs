import test from 'node:test';
import assert from 'node:assert/strict';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { mapCellPlacement, mapCellChanged } = await import('../lib/mapCells.js');

const post = (extra = {}) => ({ creator_id: 'a1', status: 'active', visibility: 'public', age_rating: 'all', lat: 41.0082, lng: 28.9784, ...extra });

test('only public, active, placed posts enter the map index, with what map reads need and nothing else', () => {
  assert.deepEqual(mapCellPlacement(post({ is_anonymous: true, spot_id: 's1', caption: 'secret' })),
    { cell: 'sxk973', entry: [41.0082, 28.9784, 'a1', 1, 's1'] });
  assert.deepEqual(mapCellPlacement(post()).entry, [41.0082, 28.9784, 'a1', 0, '']);
  for (const hidden of [{ status: 'pending_review' }, { visibility: 'private' }, { age_rating: '18_plus' }, { deleted_at: new Date() },
    { lat: 91 }, { lng: 'x' }, { creator_id: undefined }]) assert.equal(mapCellPlacement(post(hidden)), null, JSON.stringify(hidden));
  assert.equal(mapCellPlacement(undefined), null);
});

test('only changes that alter the index entry resync it', () => {
  assert.equal(mapCellChanged(post(), post({ likes_count: 9, caption: 'edited' })), false);
  assert.equal(mapCellChanged(post(), post({ spot_id: 's2' })), true);
  assert.equal(mapCellChanged(post(), post({ is_anonymous: true })), true);
  assert.equal(mapCellChanged(post(), post({ status: 'removed' })), true);
  assert.equal(mapCellChanged(undefined, post()), true);
  assert.equal(mapCellChanged(post({ status: 'pending_review' }), post({ status: 'flagged' })), false);
});
