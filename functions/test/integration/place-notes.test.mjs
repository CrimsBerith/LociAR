import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newAnonymousUser, newUser, expectFailure } from './_harness.mjs';
import { expireDueNotes } from '../../lib/noteDensity.js';
import { encodeGeohash } from '../../lib/geo.js';
import { geohashBounds } from '../../lib/placeNoteRules.js';
after(closeClients);

const METER = 1 / 111_320;
// Each fixture sits ~5 km from the others so approved notes never overlap between tests.
let fixtureIndex = 0;
const base = () => ({ lat: -12.1234 + Math.random() * 0.01 + fixtureIndex++ * 0.05, lng: -77.1234 });
const fix = (lat, lng, accuracy = 6, measuredAt = Date.now()) => ({ lat, lng, accuracy, measuredAt });
const north = (point, meters) => ({ ...point, lat: point.lat + meters * METER });

async function optIn(user) {
  const pref = await user.call('readDataPreferences');
  await user.call('setDataPreferences', { telemetry: false, location: false, revision: pref.revision, noticeVersion: '2026-10-11', placeNotes: true, placeNotesNoticeVersion: '2026-10-11-place-notes' });
}
async function note(author, point, overrides = {}) {
  const body = { userId: author.luid, clientMutationId: randomUUID(), lat: point.lat, lng: point.lng, source: 'gps', accuracy: 6, text: 'Entrance is around the back.', ...overrides };
  const created = await author.call('createPlaceNote', body);
  return { body, created, ref: adminDb.collection('posts').doc(created.post.id) };
}
const approve = (n, extra = {}) => n.ref.update({ status: 'active', push_state: 'approved', ...extra });
async function fixture() {
  const author = await newAnonymousUser(), visitor = await newAnonymousUser(), point = base();
  await optIn(visitor);
  const n = await note(author, point);
  const visit = (location = fix(point.lat, point.lng), confirmationStartedAt = Date.now() - 6000) =>
    visitor.call('recordPlaceNoteVisit', { location, confirmationStartedAt });
  return { author, visitor, point, n, visit };
}

test('location notes are anonymous pending text posts at the measured position with a tiered radius', async () => {
  const f = await fixture(), stored = (await f.n.ref.get()).data();
  assert.equal(f.n.created.publishStatus, 'pending_review');
  assert.equal(stored.is_anonymous, true); assert.equal(stored.note_kind, 'location'); assert.equal(stored.push_state, 'none');
  assert.equal(stored.notify_radius_m, 20); assert.deepEqual(stored.location_note, { source: 'gps', accuracy_m: 6, pin_drag_m: 0 });
  assert.equal(stored.lat, f.point.lat); assert.equal(stored.business_id, undefined);
  assert.equal((await f.author.call('createPlaceNote', f.n.body)).idempotentReplay, true);
  assert.equal((await expectFailure(f.author.call('createPlaceNote', { ...f.n.body, text: 'Changed text' }))).code, 'functions/already-exists');
  const fresh = overrides => f.author.call('createPlaceNote', { ...f.n.body, clientMutationId: randomUUID(), ...overrides });
  assert.equal((await expectFailure(fresh({ text: 'See https://example.com' }))).code, 'functions/invalid-argument');
  assert.equal((await expectFailure(fresh({ accuracy: 60, source: 'manual', measuredLat: f.point.lat, measuredLng: f.point.lng }))).code, 'functions/failed-precondition');
  assert.equal((await expectFailure(fresh({ accuracy: 20 }))).code, 'functions/invalid-argument', 'uncertain GPS needs a manual pin');
  const far = north(f.point, 60);
  assert.equal((await expectFailure(fresh({ ...far, source: 'manual', accuracy: 20, measuredLat: f.point.lat, measuredLng: f.point.lng }))).code, 'functions/invalid-argument');
  const near = north(f.point, 30), manual = await fresh({ ...near, source: 'manual', accuracy: 20, measuredLat: f.point.lat, measuredLng: f.point.lng });
  const m = (await adminDb.collection('posts').doc(manual.post.id).get()).data();
  assert.equal(m.notify_radius_m, 30); assert.equal(m.location_note.source, 'manual'); assert.ok(Math.abs(m.location_note.pin_drag_m - 30) < 1);
  const zone = adminDb.collection('protected_zones').doc(randomUUID());
  await zone.set({ active: true, name: 'Protected', lat: f.point.lat, lng: f.point.lng, radius_meters: 100 });
  assert.equal((await expectFailure(fresh({}))).code, 'functions/permission-denied');
  await zone.delete();
});

test('wake regions list only approved notes the visitor has not received, without author identity', async () => {
  const f = await fixture(), read = async () => (await f.visitor.call('readPlaceNoteRegions', { location: fix(f.point.lat, f.point.lng, 30) })).regions;
  await f.n.ref.update({ status: 'active' });
  assert.equal((await read()).length, 0, 'active but not approved for notifications');
  await approve(f.n);
  const [region] = await read();
  assert.equal(region.id, f.n.created.post.id); assert.equal(region.kind, 'place_note'); assert.equal(region.transition, 'entry');
  assert.ok(region.radius >= 150 && region.radius <= 400); assert.equal(region.triggerRadius, 20); assert.equal(region.notes.length, 1);
  assert.equal(JSON.stringify(region).includes(f.author.luid), false);
  assert.equal((await f.visit()).notify, true);
  assert.equal((await read()).length, 0, 'a received note no longer occupies a monitored region');
});

test('a visit sends the most-liked unseen note once, then the next one; never the same note twice', async () => {
  const f = await fixture();
  const popular = await note(f.author, north(f.point, 8), { text: 'Ask for the window table.' });
  await approve(f.n, { likes_count: 2 }); await approve(popular, { likes_count: 9 });
  const first = await f.visit();
  assert.equal(first.postId, popular.created.post.id); assert.equal(first.likes, 9); assert.equal(first.total, 2);
  assert.equal(first.body, 'Ask for the window table.');
  assert.equal((await f.visitor.call('readActivity')).items.find(i => i.id === first.activityId).body, 'Ask for the window table.');
  const second = await f.visit();
  assert.equal(second.postId, f.n.created.post.id); assert.equal(second.total, 1);
  assert.equal((await f.visit()).reason, 'nothing_new');
  // Two devices of one account racing at a fresh spot receive each note at most once between them.
  const g = await fixture(), extra = await note(g.author, north(g.point, 5), { text: 'Second note.' });
  await approve(g.n); await approve(extra);
  const raced = (await Promise.all([g.visit(), g.visit(), g.visit()])).filter(r => r.notify).map(r => r.postId);
  assert.equal(new Set(raced).size, raced.length, 'no note delivered twice'); assert.ok(raced.length <= 2);
  const receipt = await adminDb.collection('place_note_notification_receipts').doc(`post_${f.visitor.luid}_${popular.created.post.id}`).get();
  assert.equal(receipt.get('expires_at'), undefined, 'receipts never expire'); assert.equal(receipt.get('lat'), undefined);
  assert.equal((await adminDb.collection('user_locations').doc(f.visitor.luid).get()).exists, false);
});

test('realistic GPS at the door notifies; far, stale, inaccurate or unconfirmed fixes do not', async () => {
  const f = await fixture(); await approve(f.n);
  const door = north(f.point, 25);
  assert.equal((await f.visit(fix(door.lat, door.lng, 40))).reason, 'inaccurate_fix');
  assert.equal((await f.visit(fix(door.lat, door.lng, 8, Date.now() - 15_000))).reason, 'stale_fix');
  assert.equal((await f.visit(fix(door.lat, door.lng, 8), Date.now() - 2000)).reason, 'unconfirmed');
  const street = north(f.point, 60);
  assert.equal((await f.visit(fix(street.lat, street.lng, 8))).notify, false);
  assert.equal((await f.visit(fix(door.lat, door.lng, 8))).notify, true, '25 m away with 8 m accuracy touches a 20 m note');
});

test('admin radius, opt-out, kill switch, blocks, reports and removed or suspended authors prevent alerts', async () => {
  const f = await fixture(); await approve(f.n);
  const edge = north(f.point, 45), visitEdge = () => f.visit(fix(edge.lat, edge.lng, 5));
  assert.equal((await visitEdge()).notify, false);
  await f.n.ref.update({ notify_radius_m: 50 });
  const pref = adminDb.collection('user_data_preferences').doc(f.visitor.luid);
  await pref.update({ place_notes: false }); assert.equal((await visitEdge()).reason, 'disabled'); await pref.update({ place_notes: true });
  const flags = adminDb.collection('system').doc('flags'), killed = (await flags.get()).get('kill_switch') === true;
  await flags.set({ kill_switch: true }, { merge: true }); assert.equal((await visitEdge()).reason, 'disabled'); await flags.set({ kill_switch: killed }, { merge: true });
  const block = adminDb.collection('anonymous_blocks').doc(`${f.visitor.luid}_${f.author.luid}`);
  await block.set({ blocker_id: f.visitor.luid, blocked_id: f.author.luid }); assert.equal((await visitEdge()).notify, false); await block.delete();
  const report = adminDb.collection('moderation_flags').doc(randomUUID());
  await report.set({ user_id: f.visitor.luid, post_id: f.n.created.post.id }); assert.equal((await visitEdge()).notify, false); await report.delete();
  await f.n.ref.update({ push_state: 'none' }); assert.equal((await visitEdge()).notify, false); await f.n.ref.update({ push_state: 'approved' });
  await f.n.ref.update({ status: 'removed' }); assert.equal((await visitEdge()).notify, false); await f.n.ref.update({ status: 'active' });
  await adminDb.collection('profiles').doc(f.author.luid).update({ suspended: true }); assert.equal((await visitEdge()).notify, false);
  await adminDb.collection('profiles').doc(f.author.luid).update({ suspended: false }); assert.equal((await visitEdge()).notify, true, 'admin-widened radius');
});

test('location-note consent requires its own notice and remains independent of marketing consent', async () => {
  const u = await newUser(), consent = { telemetry: false, location: false, revision: '', noticeVersion: '2026-10-11', placeNotes: true };
  assert.equal((await u.call('readDataPreferences')).placeNotes, false);
  assert.equal((await expectFailure(u.call('setDataPreferences', consent))).code, 'functions/invalid-argument');
  const p = await u.call('setDataPreferences', { ...consent, placeNotesNoticeVersion: '2026-10-11-place-notes' });
  assert.equal(p.placeNotes, true); assert.equal(p.promotions, false); assert.equal(p.location, false);
});

test('account deletion removes receipts; author deletion removes retained note text for recipients', async () => {
  const f = await fixture(); await approve(f.n);
  const result = await f.visit(); assert.equal(result.notify, true);
  await f.author.call('deleteAccount');
  assert.equal((await adminDb.collection('activity_events').doc(result.activityId).get()).exists, false);
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('post_id', '==', f.n.created.post.id).get()).empty, true);
  const g = await fixture(); await approve(g.n); assert.equal((await g.visit()).notify, true);
  await g.visitor.call('deleteAccount');
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('owner_luid', '==', g.visitor.luid).get()).empty, true);
});

async function densityCount(user, point, precision) {
  const box = { minLat: point.lat - 0.002, maxLat: point.lat + 0.002, minLng: point.lng - 0.002, maxLng: point.lng + 0.002 };
  const { cells } = await user.call('readNoteDensity', { box, precision });
  return cells.reduce((s, c) => s + c.count, 0);
}
async function eventually(check, message) {
  for (let i = 0; i < 40; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 250)); }
  assert.fail(message);
}

test('map density counts only public active notes and follows removal', async () => {
  const f = await fixture();
  assert.equal(await densityCount(f.visitor, f.point, 7), 0, 'pending notes are not counted');
  await f.n.ref.update({ status: 'active' });
  await eventually(async () => await densityCount(f.visitor, f.point, 7) === 1, 'active note counted');
  assert.equal(await densityCount(f.visitor, f.point, 4) >= 1, true);
  await f.n.ref.update({ status: 'removed' });
  await eventually(async () => await densityCount(f.visitor, f.point, 7) === 0, 'removed note uncounted');
  assert.equal((await expectFailure(f.visitor.call('readNoteDensity', { box: { minLat: 1, maxLat: 0, minLng: 0, maxLng: 1 }, precision: 7 }))).code, 'functions/invalid-argument');
  assert.equal((await expectFailure(f.visitor.call('readNoteDensity', { box: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 }, precision: 9 }))).code, 'functions/invalid-argument');
});

test('an administrator end date removes the note like a moderator soft delete; notes never expire otherwise', async () => {
  const f = await fixture(); await approve(f.n, { ends_at: Timestamp.fromMillis(Date.now() - 1000) });
  const g = await fixture(); await approve(g.n, { ends_at: Timestamp.fromMillis(Date.now() + 3_600_000) });
  await expireDueNotes();
  const ended = (await f.n.ref.get()).data(), open = (await g.n.ref.get()).data();
  assert.equal(ended.status, 'removed'); assert.equal(ended.deleted_by, 'system:scheduled_end'); assert.equal(ended.ends_at, undefined); assert.ok(ended.ended_at);
  assert.equal(open.status, 'active'); assert.ok(open.ends_at);
  assert.equal((await f.visit()).notify, false); assert.equal((await g.visit()).notify, true);
});

async function denseSpot(count = 30) {
  const author = await newAnonymousUser(), visitor = await newAnonymousUser(), point = base();
  await optIn(visitor);
  const cell = encodeGeohash(point.lat, point.lng, 8), centre = geohashBounds(cell);
  const n = await note(author, { lat: centre.lat, lng: centre.lng });
  await n.ref.update({ status: 'active' });
  // Seed the spot counter directly; creating 30 posts would hit the author's rate limit.
  await eventually(async () => (await adminDb.collection('note_density').doc(`8_${cell}`).get()).get('count') === 1, 'note counted');
  await adminDb.collection('note_density').doc(`8_${cell}`).set({ precision: 8, cell, lat: centre.lat, lng: centre.lng, count }, { merge: true });
  return { visitor, author, cell, centre, n };
}
const single = (user, id) => user.call('readPublicContent', { mode: 'single', postId: id }).then(r => r.posts[0]);

test('notes in a dense spot show only place and count until the visitor unlocks the spot on site', async () => {
  const s = await denseSpot(30);
  const locked = await single(s.visitor, s.n.created.post.id);
  assert.equal(locked.locked, true); assert.equal(locked.caption, ''); assert.deepEqual(locked.edit_data.layers, []);
  assert.equal(locked.dense_spot.count, 30); assert.equal(locked.dense_spot.cell, s.cell); assert.equal(locked.dense_spot.unlock_radius_m, 15);
  assert.equal((await single(s.author, s.n.created.post.id)).caption, 'Entrance is around the back.', 'authors read their own notes');
  const far = north(s.centre, 60);
  assert.deepEqual((await s.visitor.call('unlockDenseSpot', { location: fix(far.lat, far.lng, 8) })).unlocked, []);
  assert.equal((await s.visitor.call('unlockDenseSpot', { location: fix(s.centre.lat, s.centre.lng, 8, Date.now() - 20_000) })).reason, 'stale_fix');
  const near = north(s.centre, 12);
  assert.deepEqual((await s.visitor.call('unlockDenseSpot', { location: fix(near.lat, near.lng, 8) })).unlocked, [s.cell]);
  const open = await single(s.visitor, s.n.created.post.id);
  assert.equal(open.locked, undefined); assert.equal(open.caption, 'Entrance is around the back.');
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 31 }, { merge: true });
  const other = await denseSpot(30);
  assert.equal((await single(other.visitor, other.n.created.post.id)).locked, undefined, 'below the admin threshold');
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 30 }, { merge: true });
});

test('entering a dense spot sends one text-free alert, and the region list advertises unalerted spots', async () => {
  const s = await denseSpot(42);
  const regions = (await s.visitor.call('readPlaceNoteRegions', { location: fix(s.centre.lat, s.centre.lng, 30) })).regions;
  const region = regions.find(r => r.spot === s.cell);
  assert.ok(region); assert.equal(region.kind, 'place_note'); assert.equal(region.triggerRadius, 25);
  const visit = () => s.visitor.call('recordPlaceNoteVisit', { location: fix(s.centre.lat, s.centre.lng, 8), confirmationStartedAt: Date.now() - 6000 });
  const alert = await visit();
  assert.equal(alert.notify, true); assert.equal(alert.kind, 'dense_spot'); assert.equal(alert.total, 42); assert.equal(alert.body, undefined);
  assert.equal((await visit()).notify, false, 'once per 30 days');
  assert.equal((await s.visitor.call('readPlaceNoteRegions', { location: fix(s.centre.lat, s.centre.lng, 30) })).regions.some(r => r.spot === s.cell), false);
});
