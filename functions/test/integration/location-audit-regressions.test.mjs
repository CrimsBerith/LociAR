import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newAnonymousUser, newUser, postBody, expectFailure } from './_harness.mjs';
import { db, Timestamp } from '../../lib/core.js';
import { encodeGeohash } from '../../lib/geo.js';
import { geoCandidates } from '../../lib/geoQuery.js';
import { syncSpotMembership, repairSpotCount, denseLocks } from '../../lib/denseSpots.js';
import { autoApproveNote } from '../../lib/noteAutomation.js';
after(closeClients);
let priorSettings;
before(async () => { priorSettings = (await adminDb.collection('system').doc('place_notes').get()).data(); });
after(async () => {
  const ref = adminDb.collection('system').doc('place_notes');
  if (priorSettings) await ref.set(priorSettings); else await ref.delete();
});

const meter = 1 / 111320;
let fixtureIndex = 0;
const fix = p => ({ ...p, accuracy: 6, measuredAt: Date.now() });
async function fixture() {
  // Guests may browse and receive alerts; only verified accounts publish (anonymous.ts).
  const author = await newUser(), visitor = await newAnonymousUser();
  const point = { lat: -30 + fixtureIndex++ * 0.1, lng: 100 };
  await adminDb.collection('user_data_preferences').doc(visitor.luid).set({ owner_luid: visitor.luid, notifications: true, place_notes: true });
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 1000, push_like_threshold: 3 });
  return { author, visitor, point };
}
async function notes(f, count, spacing = 1, extra = {}) {
  const batch = adminDb.batch();
  const refs = Array.from({ length: count }, (_, i) => {
    const ref = adminDb.collection('posts').doc(randomUUID()), p = { ...f.point, lat: f.point.lat + i * spacing * meter };
    batch.set(ref, { creator_id: f.author.luid, is_anonymous: true, status: 'active', visibility: 'public', age_rating: 'all',
      note_kind: 'location', push_state: 'approved', notify_radius_m: 100, caption: `Note ${i}`, likes_count: count - i,
      ...p, geohash: encodeGeohash(p.lat, p.lng, 10), created_at: Timestamp.now(),
      pose_json: JSON.stringify({ latitude: p.lat, longitude: p.lng, heading: 0 }),
      edit_data_json: JSON.stringify({ version: 1, layers: [{ id: randomUUID(), type: 'text', text: `Note ${i}` }] }), ...extra });
    return ref;
  });
  await batch.commit(); return refs;
}
async function seen(f, refs) {
  const batch = adminDb.batch();
  for (const ref of refs) batch.set(adminDb.collection('place_note_notification_receipts').doc(`post_${f.visitor.luid}_${ref.id}`), {
    owner_luid: f.visitor.luid, post_id: ref.id, delivery_state: 'queued', created_at: Timestamp.now() });
  await batch.commit();
}
const visit = f => f.visitor.call('recordPlaceNoteVisit', { location: fix(f.point), confirmationStartedAt: Date.now() - 11000 });

test('eighty seen notes do not starve the next wake region, and large clusters fit the native 50-target contract', async () => {
  const f = await fixture(), refs = await notes(f, 81, 0.4);
  await seen(f, refs.slice(0, 80));
  for (let i = 0; i < 2; i++) assert.ok((await f.visitor.call('readPlaceNoteRegions', { location: fix(f.point) })).regions.some(r => r.id === refs[80].id));
  const receipts = adminDb.batch(); for (const ref of refs.slice(0, 80)) receipts.delete(adminDb.collection('place_note_notification_receipts').doc(`post_${f.visitor.luid}_${ref.id}`)); await receipts.commit();
  const regions = (await f.visitor.call('readPlaceNoteRegions', { location: fix(f.point) })).regions;
  assert.ok(regions.length >= 2); assert.ok(regions.every(r => r.notes.length <= 50));
});
test('forty seen notes do not starve a new visit, and receipts still prevent repeats', async () => {
  const f = await fixture(), refs = await notes(f, 41, 0.3); await seen(f, refs.slice(0, 40));
  assert.equal((await visit(f)).postId, refs[40].id);
  assert.equal((await visit(f)).notify, false);
});
test('a full geohash page of flagged rows does not hide a later active note', async () => {
  const f = await fixture();
  const far = { ...f, point: { ...f.point, lat: f.point.lat - 50 * meter } };
  await notes(far, 400, 0, { status: 'flagged', notify_radius_m: 15 });
  const [ref] = await notes(f, 1);
  assert.equal((await visit(f)).postId, ref.id);
});
test('polar and date-line note searches retain complete coverage; exhausted scans throw explicitly', async () => {
  for (const point of [{ lat: 89.9999, lng: 1 }, { lat: -25, lng: 179.9999 }]) {
    const f = await fixture(); f.point = point;
    const [ref] = await notes(f, 1);
    const queryPoint = point.lng > 179 ? { ...point, lng: -179.9999 } : point;
    assert.ok((await f.visitor.call('readPlaceNoteRegions', { location: fix(queryPoint) })).regions.some(r => r.id === ref.id));
  }
  const f = await fixture(); await notes(f, 3);
  await assert.rejects(db.runTransaction(tx => geoCandidates(tx, db.collection('posts'), f.point.lat, f.point.lng, 120, 2)), e => e.code === 'resource-exhausted');
});
test('hard delete settles persistent spot membership once, removes false locks and account deletion cleans remaining members', async () => {
  const f = await fixture(), refs = await notes(f, 5);
  for (const ref of refs) await syncSpotMembership(ref.id);
  const spotId = (await refs[0].get()).get('spot_id'), spot = adminDb.collection('note_spots').doc(spotId);
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 5 });
  assert.equal((await spot.get()).get('count'), 5);
  await refs[0].delete(); await syncSpotMembership(refs[0].id); await syncSpotMembership(refs[0].id);
  assert.equal((await spot.get()).get('count'), 4);
  assert.equal((await denseLocks(await Promise.all(refs.slice(1).map(r => r.get())), f.visitor.luid)).size, 0);
  await f.author.call('deleteAccount');
  assert.equal((await adminDb.collection('note_spot_members').where('owner_luid', '==', f.author.luid).get()).empty, true);
  assert.equal((await spot.get()).get('count'), 0);
});
test('legacy inflated spot counts converge to live source rows on repeat repairs', async () => {
  const f = await fixture(), id = randomUUID();
  await adminDb.collection('note_spots').doc(id).set({ ...f.point, geohash: encodeGeohash(f.point.lat, f.point.lng, 9), radius: 10, count: 99 });
  await notes(f, 2, 1, { spot_id: id });
  await repairSpotCount(id); await repairSpotCount(id);
  assert.equal((await adminDb.collection('note_spots').doc(id).get()).get('count'), 2);
});
test('notification approval reads later established likes, including thresholds above 200 and deletion fences', async () => {
  const f = await fixture(), [ref] = await notes(f, 1, 0, { push_state: 'none', likes_count: 201 });
  await adminDb.collection('system').doc('place_notes').set({ push_like_threshold: 201 });
  const batch = adminDb.batch(), old = Timestamp.fromMillis(Date.now() - 2 * 86400000), ids = [];
  for (let i = 0; i < 201; i++) {
    const id = randomUUID(); ids.push(id);
    batch.set(adminDb.collection('profiles').doc(id), { created_at: old });
    batch.set(adminDb.collection('likes').doc(`${ref.id}_${id}`), { post_id: ref.id, user_id: id });
  }
  await batch.commit();
  const fence = adminDb.collection('account_deletion_jobs').doc(ids[0]); await fence.set({ status: 'pending' });
  assert.equal(await autoApproveNote(ref.id), false);
  await fence.delete(); assert.equal(await autoApproveNote(ref.id), true);
});
test('public anonymous projections remove old media paths and preserve drawable layers in all feed modes', async () => {
  const f = await fixture(), [ref] = await notes(f, 1);
  await ref.update({ edit_data_json: JSON.stringify({ version: 1, surfaceTextureUri: `storage://post-surface-textures/${f.author.luid}/x`, layers: [
    { id: randomUUID(), type: 'image', uri: `storage://post-layer-assets/${f.author.luid}/x` },
    { id: randomUUID(), type: 'drawing', points: [{ x: 1, y: 2 }], uri: `storage://hidden/${f.author.luid}` },
  ] }), content_source_json: JSON.stringify({ platform: 'other', url: `storage://post-layer-assets/${f.author.luid}/x`, mediaKind: 'image' }) });
  for (const payload of [{ mode: 'single', postId: ref.id }, { mode: 'nearby', latitude: f.point.lat, longitude: f.point.lng, radiusMeters: 120 },
    { mode: 'discover' }, { mode: 'creator', creatorId: f.author.luid }]) {
    const response = await f.visitor.call('readPublicContent', payload);
    assert.equal(JSON.stringify(response).includes(f.author.luid), false);
    const post = response.posts.find(p => p.id === ref.id);
    if (post) { assert.equal(post.content_source, null); assert.deepEqual(post.edit_data.layers.map(l => l.type), ['drawing']); }
  }
});
test('AR posts reject URL text at the callable admission boundary', async () => {
  const f = await fixture();
  const error = await expectFailure(f.author.call('createPost', postBody({ caption: 'https://example.com/product' })));
  assert.equal(error.code, 'functions/invalid-argument');
});
test('nearby sets keep a close low-engagement note ahead of one hundred popular distant notes', async () => {
  const f = await fixture(), far = { ...f, point: { ...f.point, lat: f.point.lat + 800 * meter } };
  await notes(far, 100, 0, { engagement_score: 10000 });
  const [close] = await notes(f, 1, 0, { engagement_score: 0 });
  const response = await f.visitor.call('readPublicContent', { mode: 'nearby', latitude: f.point.lat, longitude: f.point.lng, radiusMeters: 1000 });
  assert.equal(response.posts[0].id, close.id); assert.equal(response.posts.length, 100);
});
