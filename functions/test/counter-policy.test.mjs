import test from 'node:test';
import assert from 'node:assert/strict';
import { engagementScore, legacyManualMetrics, isPublicActive } from '../lib/counters.js';

test('engagement uses visible nonnegative metrics and rejects nonfinite stored values', () => {
  assert.equal(engagementScore(7, 2, 3), 28);
  assert.equal(engagementScore(-3, -2, 1), 5);
  assert.equal(engagementScore(NaN, Infinity, '5'), 0);
});
test('legacy manual preservation requires explicit edit metadata and complete signed offsets', () => {
  assert.equal(legacyManualMetrics({ likes_count: 100 }), false);
  assert.equal(legacyManualMetrics({ metrics_admin_edited_by: 'admin' }), true);
  assert.equal(legacyManualMetrics({ metrics_admin_edited_at: 1, metrics_counter_offsets: { likes_count: -2, comments_count: 7 } }), false);
  assert.equal(legacyManualMetrics({ metrics_admin_edited_by: 'admin', metrics_counter_offsets: { likes_count: 1 } }), true);
});
test('public post counts include legacy optional fields and exclude all hidden states', () => {
  assert.equal(isPublicActive({ status: 'active', visibility: 'public' }), true);
  for (const override of [{ status: 'removed' }, { visibility: 'private' }, { age_rating: '18_plus' }, { deleted_at: 1 }]) {
    assert.equal(isPublicActive({ status: 'active', visibility: 'public', ...override }), false);
  }
});
