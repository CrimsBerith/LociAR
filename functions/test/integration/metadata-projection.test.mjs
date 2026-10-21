import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newAnonymousUser } from './_harness.mjs';
import { db, Timestamp } from '../../lib/core.js';
import { encodeGeohash } from '../../lib/geo.js';
import { geoCandidates } from '../../lib/geoQuery.js';
import { NOTE_CANDIDATE_FIELDS } from '../../lib/placeNotes.js';
after(closeClients);

test('metadata field masks preserve polar cursors, ranking and note visits without carrying AR payloads', async t => {
  const author = await newAnonymousUser(), viewer = await newAnonymousUser();
  const refs = [], geometry = JSON.stringify({ unusedLegacyGeometry: 'x'.repeat(200_000) });
  const points = [{ lat: -67, lng: 110 }, { lat: 89.99991, lng: 25 }];
  for (const point of points) {
    const ref = adminDb.collection('posts').doc(randomUUID()); refs.push(ref);
    await ref.set({ ...point, creator_id: author.luid, status: 'active', visibility: 'public', age_rating: 'all',
      is_anonymous: true, push_state: 'approved', note_kind: 'location', caption: 'Metadata note',
      notify_radius_m: 30, likes_count: 7, created_at: Timestamp.now(), geohash: encodeGeohash(point.lat, point.lng),
      edit_data_json: geometry, anchor_bundle_json: geometry, calibration_json: geometry });
  }
  await adminDb.collection('user_data_preferences').doc(viewer.luid).set({ place_notes: true, notifications: true });
  try {
    let fullBytes = 0, projectedBytes = 0;
    for (const [index, point] of points.entries()) {
      const query = db.collection('posts').where('push_state', '==', 'approved').select(...NOTE_CANDIDATE_FIELDS);
      const rows = await db.runTransaction(tx => geoCandidates(tx, query, point.lat, point.lng, 125));
      const projected = rows.find(row => row.id === refs[index].id);
      assert.ok(projected); assert.equal(projected.get('anchor_bundle_json'), undefined);
      fullBytes += Buffer.byteLength(JSON.stringify((await refs[index].get()).data()));
      projectedBytes += Buffer.byteLength(JSON.stringify(projected.data()));
      const location = { ...point, accuracy: 6, measuredAt: Date.now() };
      const regions = await viewer.call('readPlaceNoteRegions', { location });
      assert.ok(regions.regions.some(region => region.id === refs[index].id));
      const visit = await viewer.call('recordPlaceNoteVisit', { location: { ...location, measuredAt: Date.now() }, confirmationStartedAt: Date.now() - 11_000 });
      assert.equal(visit.postId, refs[index].id); assert.equal(visit.body, 'Metadata note'); assert.equal(visit.likes, 7);
    }
    assert.ok(projectedBytes < fullBytes * 0.01);
    t.diagnostic(JSON.stringify({ fixtureFullBytes: fullBytes, fixtureProjectedBytes: projectedBytes, projectedFraction: projectedBytes / fullBytes }));
  } finally { await Promise.all(refs.map(ref => ref.delete())); }
});
