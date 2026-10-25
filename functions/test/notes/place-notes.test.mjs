import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
// Run in a fresh emulator (npm run test:notes). Bulk integration fixtures leave
// queued triggers behind even when their serial test files have finished.
import { adminDb, closeClients, newAnonymousUser, newUser, expectFailure } from '../integration/_harness.mjs';
import { expireDueNotes } from '../../lib/noteDensity.js';
import { db } from '../../lib/core.js';
import { readableNoteIds } from '../../lib/placeNoteAccess.js';
import { repairSpotCount, syncSpotMembership } from '../../lib/denseSpots.js';
import { geohashBounds } from '../../lib/placeNoteRules.js';
after(closeClients);
before(async () => {
  for (const collection of ['posts', 'note_density', 'note_density_members', 'note_spots']) {
    assert.equal((await adminDb.collection(collection).limit(1).get()).empty, true,
      `${collection} is not empty; run npm run test:notes in its own fresh emulator`);
  }
});

const METER = 1 / 111_320;
// Each fixture sits ~5 km from the others so approved notes never overlap between tests.
let fixtureIndex = 0;
const base = () => ({ lat: -12.1234 + Math.random() * 0.01 + fixtureIndex++ * 0.05, lng: -77.1234 });
const fix = (lat, lng, accuracy = 6, measuredAt = Date.now()) => ({ lat, lng, accuracy, measuredAt });
const north = (point, meters) => ({ ...point, lat: point.lat + meters * METER });

async function optIn(user) {
  const pref = await user.call('readDataPreferences');
  await user.call('setDataPreferences', { telemetry: false, location: false, revision: pref.revision, noticeVersion: '2026-10-11', notifications: true, notificationsNoticeVersion: '2026-10-11-notifications', placeNotes: true, placeNotesNoticeVersion: '2026-10-11-place-notes' });
}
async function note(author, point, overrides = {}) {
  const body = { userId: author.luid, clientMutationId: randomUUID(), lat: point.lat, lng: point.lng, source: 'gps', accuracy: 6, text: 'Entrance is around the back.', ...overrides };
  const created = await author.call('createPlaceNote', body);
  return { body, created, ref: adminDb.collection('posts').doc(created.post.id) };
}
const approve = (n, extra = {}) => n.ref.update({ status: 'active', push_state: 'approved', ...extra });
async function fixture(text = 'Entrance is around the back.') {
  const author = await newUser(), visitor = await newAnonymousUser(), point = base();
  await optIn(visitor);
  const n = await note(author, point, { text });
  const visit = (location = fix(point.lat, point.lng), confirmationStartedAt = Date.now() - 11_000) =>
    visitor.call('recordPlaceNoteVisit', { location, confirmationStartedAt });
  return { author, visitor, point, n, visit };
}

test('note regions and visits require explicit global consent before consuming a lifetime receipt', async () => {
  const f = await fixture(); await approve(f.n);
  const pref = adminDb.collection('user_data_preferences').doc(f.visitor.luid);
  for (const value of [FieldValue.delete(), false, null, 'true']) {
    await pref.update({ notifications: value, place_notes: true });
    assert.deepEqual((await f.visitor.call('readPlaceNoteRegions', { location: fix(f.point.lat, f.point.lng) })).regions, []);
    assert.deepEqual(await f.visit(), { notify: false, reason: 'disabled' });
    assert.equal((await adminDb.collection('place_note_notification_receipts').where('owner_luid', '==', f.visitor.luid).get()).size, 0);
  }
  await pref.update({ notifications: true });
  assert.equal((await f.visit()).notify, true);
});

test('a shop note waits ten seconds and an early visit does not consume its one-time delivery', async () => {
  const warning = 'Bu ürünü alma, kalitesi düşük.';
  const f = await fixture(warning);
  await approve(f.n);
  const location = fix(f.point.lat, f.point.lng), measured = location.measuredAt;
  for (const elapsed of [5000, 9999]) {
    const early = await f.visit(location, measured - elapsed);
    assert.equal(early.notify, false); assert.equal(early.reason, 'unconfirmed');
  }
  const delivered = await f.visit(location, measured - 10_000);
  assert.equal(delivered.notify, true); assert.equal(delivered.body, warning);
  assert.equal(delivered.creator_id, undefined); assert.equal(delivered.actor_id, undefined);
  assert.equal((await f.visit(location, measured - 10_000)).notify, false, 'one note reaches each visitor once');
});

test('location notes publish at once, anonymously, at the measured position with a tiered radius', async () => {
  const f = await fixture(), stored = (await f.n.ref.get()).data();
  assert.equal(f.n.created.publishStatus, 'active'); assert.equal(stored.status, 'active');
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
  for (const status of ['pending_review', 'flagged', 'removed']) {
    await f.n.ref.update({ status });
    const replay = await f.author.call('createPlaceNote', f.n.body);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.publishStatus, status, 'replaying a committed mutation must preserve moderation state');
    assert.equal((await f.n.ref.get()).get('status'), status);
  }
});

test('location-note text uses the same trimmed UTF-16 limit as the native composers', async () => {
  const author = await newUser(), point = base();
  for (const text of ['😀'.repeat(110), 'e\u0301'.repeat(110), 'a'.repeat(220)]) {
    const n = await note(author, point, { text });
    assert.equal(n.created.publishStatus, 'active');
    assert.equal((await n.ref.get()).get('caption'), text);
  }
  for (const text of ['😀'.repeat(111), 'e\u0301'.repeat(111), 'a'.repeat(221)]) {
    const error = await expectFailure(note(author, point, { text }));
    assert.equal(error.code, 'functions/invalid-argument');
    assert.equal(error.details.reason, 'invalid_caption');
  }
  // Leading/trailing whitespace is trimmed before the limit, matching the composer's trimmed count.
  const padded = await note(author, point, { text: `\n  ${'a'.repeat(220)} \t` });
  assert.equal(padded.created.publishStatus, 'active');
  assert.equal((await padded.ref.get()).get('caption'), 'a'.repeat(220));
  assert.equal((await adminDb.collection('posts').where('creator_id', '==', author.luid).get()).size, 4);
});

test('location-note validation returns stable localized reasons without writing rejected content', async () => {
  const author = await newUser(), point = base();
  for (const [text, reason] of [['See https://example.com', 'links_not_allowed'], ['siktir git', 'content_not_allowed'], ['a\u0001b', 'invalid_caption']]) {
    const error = await expectFailure(note(author, point, { text }));
    assert.equal(error.code, 'functions/invalid-argument');
    assert.equal(error.details.reason, reason);
  }
  assert.equal((await adminDb.collection('posts').where('creator_id', '==', author.luid).get()).size, 0);
  const valid = await note(author, point, { text: 'Bu ürün kalitesiz, alma.' });
  assert.equal(valid.created.publishStatus, 'active', 'an ordinary negative review remains publishable');
});

test('interrupted local delivery replays the same note until acknowledged without consuming another note', async () => {
  const f = await fixture(); await approve(f.n);
  const extra = await note(f.author, north(f.point, 5), { text: 'Another useful note.' }); await approve(extra);
  const deliveryId = randomUUID(), payload = () => ({ deliveryId, location: fix(f.point.lat, f.point.lng), confirmationStartedAt: Date.now() - 11_000 });
  const first = await f.visitor.call('recordPlaceNoteVisit', payload());
  const replay = await f.visitor.call('recordPlaceNoteVisit', payload());
  assert.equal(first.notify, true); assert.equal(replay.postId, first.postId); assert.equal(replay.activityId, first.activityId);
  assert.equal(replay.deliveryId, deliveryId); assert.equal(replay.body, first.body);
  assert.equal((await f.visitor.call('readPlaceNoteRegions', { location: fix(f.point.lat, f.point.lng) })).regions.length > 0, true);
  const requestReceipt = adminDb.collection('place_note_notification_receipts').doc(`delivery_${f.visitor.luid}_${deliveryId}`);
  assert.equal((await requestReceipt.get()).get('delivery_state'), 'pending');
  const ack = { action: 'acknowledge', deliveryId };
  for (let i = 0; i < 2; i++) assert.equal((await f.visitor.call('recordPlaceNoteVisit', ack)).reason, 'already_queued');
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'already_queued');
  assert.equal((await requestReceipt.get()).get('delivery_state'), 'queued');
  assert.notEqual((await f.visit()).postId, first.postId);
  await optIn(f.author);
  assert.equal((await expectFailure(f.author.call('recordPlaceNoteVisit', ack))).code, 'functions/not-found');
});

test('delivery retries recheck consent, moderation and distance and never retain private payloads', async () => {
  const f = await fixture(); await approve(f.n);
  const deliveryId = randomUUID(), payload = () => ({ deliveryId, location: fix(f.point.lat, f.point.lng), confirmationStartedAt: Date.now() - 11_000 });
  const [first, second] = await Promise.all([f.visitor.call('recordPlaceNoteVisit', payload()), f.visitor.call('recordPlaceNoteVisit', payload())]);
  assert.equal(first.activityId, second.activityId);
  await adminDb.collection('user_data_preferences').doc(f.visitor.luid).update({ place_notes: false });
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'disabled');
  await adminDb.collection('user_data_preferences').doc(f.visitor.luid).update({ place_notes: true });
  await f.n.ref.update({ status: 'removed' }); assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'delivery_unavailable');
  await f.n.ref.update({ status: 'active' });
  const block = adminDb.collection('anonymous_blocks').doc(`${f.visitor.luid}_${f.author.luid}`);
  await block.set({ blocker_id: f.visitor.luid, blocked_id: f.author.luid });
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'delivery_unavailable'); await block.delete();
  const far = north(f.point, 100);
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', { ...payload(), location: fix(far.lat, far.lng) })).reason, 'delivery_unavailable');
  const stored = (await adminDb.collection('place_note_notification_receipts').doc(`delivery_${f.visitor.luid}_${deliveryId}`).get()).data();
  for (const field of ['body', 'caption', 'lat', 'lng', 'location', 'creator_id']) assert.equal(stored[field], undefined);
  await f.author.call('deleteAccount');
  assert.equal((await adminDb.collection('place_note_notification_receipts').doc(`delivery_${f.visitor.luid}_${deliveryId}`).get()).exists, false);
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

test('pending delivery expiry frees wake regions while lifetime receipts still prevent duplicate notes', async () => {
  const f = await fixture(); await approve(f.n);
  const deliveryId = randomUUID(), payload = () => ({ deliveryId, location: fix(f.point.lat, f.point.lng), confirmationStartedAt: Date.now() - 11_000 });
  const first = await f.visitor.call('recordPlaceNoteVisit', payload()); assert.equal(first.notify, true);
  const postReceipt = adminDb.collection('place_note_notification_receipts').doc(`post_${f.visitor.luid}_${f.n.created.post.id}`);
  const requestReceipt = adminDb.collection('place_note_notification_receipts').doc(`delivery_${f.visitor.luid}_${deliveryId}`);
  const read = () => f.visitor.call('readPlaceNoteRegions', { location: fix(f.point.lat, f.point.lng) });
  assert.ok((await read()).regions.some(region => region.id === f.n.created.post.id));
  assert.ok((await postReceipt.get()).get('retry_until') instanceof Timestamp);
  // Old deployed receipts lack retry_until: created_at still provides the same bound.
  for (const ref of [postReceipt, requestReceipt]) await ref.set({ created_at: Timestamp.fromMillis(Date.now() - 86_401_000), retry_until: Timestamp.fromMillis(Date.now() + 86_400_000) }, { merge: true });
  await postReceipt.update({ retry_until: FieldValue.delete() });
  assert.equal((await read()).regions.length, 0);
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'delivery_expired');
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', { ...payload(), deliveryId: randomUUID() })).notify, false);
  assert.equal((await postReceipt.get()).exists, true, 'expiry never removes the lifetime once-per-note fence');
  assert.equal((await postReceipt.get()).get('expires_at'), undefined, 'no TTL on lifetime receipts');
  await f.visitor.call('recordPlaceNoteVisit', { action: 'acknowledge', deliveryId });
  assert.equal((await requestReceipt.get()).get('delivery_state'), 'queued', 'a late queue acknowledgement remains valid');
});

test('shared author checks read three documents total and reports/mutes are rechecked on the next transaction', async () => {
  const f = await fixture(); await approve(f.n);
  const extra = await note(f.author, north(f.point, 4)); await approve(extra);
  let batches;
  const read = () => db.runTransaction(async tx => {
    const posts = await tx.getAll(db.collection('posts').doc(f.n.created.post.id), db.collection('posts').doc(extra.created.post.id));
    batches = [];
    const observed = new Proxy(tx, { get(target, key) {
      if (key === 'getAll') return (...refs) => { batches.push(refs.map(ref => ref.path)); return target.getAll(...refs); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return readableNoteIds(observed, posts, f.visitor.luid);
  });
  assert.equal((await read()).size, 2);
  assert.deepEqual(batches.map(batch => batch.length), [2, 1], 'two anonymous notes from one author need three documents, not a set per note');
  const report = adminDb.collection('moderation_flags').doc(randomUUID());
  await report.set({ user_id: f.visitor.luid, post_id: extra.created.post.id });
  assert.deepEqual([...await read()], [f.n.created.post.id]);
  // Profile blocks in either direction, and the author's own mutes, never hide anonymous notes:
  // a note that disappears after a block would name its author (functions/src/visibility.ts).
  for (const [collection, a, b] of [['user_blocks', f.visitor.luid, f.author.luid], ['user_blocks', f.author.luid, f.visitor.luid], ['anonymous_blocks', f.author.luid, f.visitor.luid]]) {
    const ref = adminDb.collection(collection).doc(`${a}_${b}`);
    await ref.set({ blocker_id: a, blocked_id: b }); assert.equal((await read()).size, 1, `${collection} ${a === f.visitor.luid ? 'by' : 'of'} the visitor`); await ref.delete();
  }
  const mute = adminDb.collection('anonymous_blocks').doc(`${f.visitor.luid}_${f.author.luid}`);
  await mute.set({ blocker_id: f.visitor.luid, blocked_id: f.author.luid }); assert.equal((await read()).size, 0, 'the visitor muted this author'); await mute.delete();
  // A legacy attributed note follows profile blocks in both directions instead.
  await f.n.ref.update({ is_anonymous: false });
  assert.equal((await read()).size, 1);
  assert.deepEqual(batches.map(batch => batch.length), [2, 3], 'one mute and two profile-block documents for an author with both kinds');
  for (const [a, b] of [[f.visitor.luid, f.author.luid], [f.author.luid, f.visitor.luid]]) {
    const ref = adminDb.collection('user_blocks').doc(`${a}_${b}`);
    await ref.set({ blocker_id: a, blocked_id: b }); assert.equal((await read()).size, 0, 'attributed notes follow profile blocks'); await ref.delete();
  }
  await f.n.ref.update({ is_anonymous: true });
  await adminDb.collection('profiles').doc(f.author.luid).update({ suspended: true }); assert.equal((await read()).size, 0);
  assert.deepEqual(batches.map(batch => batch.length), [2], 'suspended authors incur no block or report reads');
  await adminDb.collection('profiles').doc(f.author.luid).update({ suspended: false }); assert.equal((await read()).size, 1);
  await adminDb.collection('account_deletion_jobs').doc(f.author.luid).set({ status: 'pending' }); assert.equal((await read()).size, 0);
});

test('a visit sends the most-liked unseen note once, then the next one; never the same note twice', async () => {
  const f = await fixture();
  const popular = await note(f.author, north(f.point, 8), { text: 'Ask for the window table.' });
  await approve(f.n, { likes_count: 2 }); await approve(popular, { likes_count: 9 });
  const first = await f.visit();
  assert.equal(first.postId, popular.created.post.id); assert.equal(first.likes, 9); assert.equal(first.total, 2);
  assert.equal(first.body, 'Ask for the window table.', 'the confirmed on-site notification may show the note');
  assert.equal((await f.visitor.call('readActivity')).items.find(i => i.id === first.activityId).body, '', 'activity reveals no note text without a fresh on-site read');
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
  const reading = adminDb.collection('dense_spot_unlocks').doc(`${f.visitor.luid}_note_${f.n.created.post.id}`);
  await reading.set({ owner_luid: f.visitor.luid, post_id: f.n.created.post.id, kind: 'note_read', expires_at: Timestamp.fromMillis(Date.now() + 60_000) });
  const paging = adminDb.collection('map_group_sessions').doc(randomUUID());
  await paging.set({ owner_luid: f.visitor.luid, post_ids: [f.n.created.post.id], expires_at: Timestamp.fromMillis(Date.now() + 60_000) });
  await f.author.call('deleteAccount');
  assert.equal((await paging.get()).exists, false, 'author deletion removes snapshots containing authored notes');
  assert.equal((await reading.get()).exists, false, 'author deletion also removes other viewers\' note-reading receipts');
  assert.equal((await adminDb.collection('activity_events').doc(result.activityId).get()).exists, false);
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('post_id', '==', f.n.created.post.id).get()).empty, true);
  const g = await fixture(); await approve(g.n); assert.equal((await g.visit()).notify, true);
  const ownedPage = adminDb.collection('map_group_sessions').doc(randomUUID());
  await ownedPage.set({ owner_luid: g.visitor.luid, post_ids: [], expires_at: Timestamp.fromMillis(Date.now() + 60_000) });
  await g.visitor.call('deleteAccount');
  assert.equal((await ownedPage.get()).exists, false);
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('owner_luid', '==', g.visitor.luid).get()).empty, true);
});

async function densityCount(user, point, precision) {
  const box = { minLat: point.lat - 0.002, maxLat: point.lat + 0.002, minLng: point.lng - 0.002, maxLng: point.lng + 0.002 };
  const { cells } = await user.call('readNoteDensity', { box, precision });
  return cells.reduce((s, c) => s + c.count, 0);
}
async function eventually(check, message) {
  // Bound real trigger delivery; do not retry failed tests or repair their state.
  for (let i = 0; i < 120; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 250)); }
  assert.fail(typeof message === 'function' ? await message() : message);
}

test('map density counts public active notes and follows removal', async t => {
  const f = await fixture();
  const started = performance.now(), observations = [];
  let observed, lastSample = -5000;
  t.diagnostic(`density fixture: ${JSON.stringify({ postId: f.n.ref.id, point: f.point })}`);
  await eventually(async () => {
    const count = await densityCount(f.visitor, f.point, 7), elapsed = Math.round(performance.now() - started);
    if (count !== observed || elapsed - lastSample >= 5000) {
      const member = await adminDb.collection('note_density_members').doc(f.n.ref.id).get();
      observations.push({ elapsed, count, memberExists: member.exists });
      lastSample = elapsed;
    }
    observed = count;
    return count === 1;
  }, async () => {
    const member = await adminDb.collection('note_density_members').doc(f.n.ref.id).get();
    const post = await f.n.ref.get();
    return `active note counted: ${JSON.stringify({ observed, point: f.point, member: member.data(), status: post.get('status'), observations })}`;
  });
  t.diagnostic(`density activation: ${JSON.stringify(observations)}`);
  assert.equal(await densityCount(f.visitor, f.point, 4) >= 1, true);
  const coarse = await f.visitor.call('readNoteDensity', { precision: 6,
    box: { minLat: f.point.lat - 0.002, maxLat: f.point.lat + 0.002, minLng: f.point.lng - 0.002, maxLng: f.point.lng + 0.002 } });
  assert.equal(coarse.summaryVersion, 1);
  assert.ok(coarse.cells.length > 0);
  for (const cell of coarse.cells) {
    const center = geohashBounds(cell.cell);
    assert.equal(cell.lat, center.lat, 'coarse heat never discloses a singleton mean latitude');
    assert.equal(cell.lng, center.lng, 'coarse heat never discloses a singleton mean longitude');
  }
  const member = await adminDb.collection('note_density_members').doc(f.n.ref.id).get();
  const cellId = member.get('cells').find(id => id.startsWith('7_'));
  const cell = await adminDb.collection('note_density').doc(cellId).get();
  assert.ok(Math.abs(cell.get('lat') - f.point.lat) < 1e-8, 'heat sits on the actual note, not a geohash centre');
  assert.ok(Math.abs(cell.get('lng') - f.point.lng) < 1e-8);
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

/** Five notes within ~6 m form a spot; its count is then raised to simulate a crowded place. */
async function denseSpot(count = 30) {
  const author = await newUser(), visitor = await newAnonymousUser(), point = base();
  await optIn(visitor);
  const notes = [];
  for (const [n, e] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
    notes.push(await note(author, { lat: point.lat + n * METER, lng: point.lng + e * METER }, { text: `Note ${n}/${e}` }));
  }
  let spotId;
  await eventually(async () => { spotId = (await notes[0].ref.get()).get('spot_id'); return typeof spotId === 'string' && (await adminDb.collection('note_spots').doc(spotId).get()).get('count') === 5; }, 'spot formed');
  await adminDb.collection('note_spots').doc(spotId).update({ count });
  const spot = (await adminDb.collection('note_spots').doc(spotId).get()).data();
  return { visitor, author, spotId, centre: { lat: spot.lat, lng: spot.lng }, n: notes[0] };
}

test('a response-lost dense-spot alert replays without text and acknowledges the same delivery', async () => {
  const f = await denseSpot(), deliveryId = randomUUID();
  const payload = () => ({ deliveryId, location: fix(f.centre.lat, f.centre.lng), confirmationStartedAt: Date.now() - 11_000 });
  const first = await f.visitor.call('recordPlaceNoteVisit', payload()), retry = await f.visitor.call('recordPlaceNoteVisit', payload());
  assert.equal(first.notify, true); assert.equal(retry.activityId, first.activityId); assert.equal(retry.kind, 'dense_spot');
  assert.equal(retry.body, undefined); assert.equal(retry.postId, undefined);
  await f.visitor.call('recordPlaceNoteVisit', { action: 'acknowledge', deliveryId });
  assert.equal((await f.visitor.call('recordPlaceNoteVisit', payload())).reason, 'already_queued');
});
async function actualSpot(count) {
  const s = await denseSpot(count);
  const template = (await s.n.ref.get()).data();
  const batch = adminDb.batch();
  for (let index = 5; index < count; index++) {
    const id = randomUUID();
    batch.set(adminDb.collection('posts').doc(id), { ...template, id, client_mutation_id: id,
      caption: `Map note ${index}`, likes_count: 0, created_at: Timestamp.now() });
  }
  if (count > 5) await batch.commit();
  return s;
}
const single = (user, id) => user.call('readPublicContent', { mode: 'single', postId: id }).then(r => r.posts[0]);

test('notes in a dense spot show only place and count until the visitor unlocks the spot on site', async () => {
  const s = await denseSpot(30);
  const locked = await single(s.visitor, s.n.created.post.id);
  assert.equal(locked.locked, true); assert.equal(locked.caption, ''); assert.deepEqual(locked.edit_data.layers, []);
  assert.equal(locked.dense_spot.count, 30); assert.equal(locked.dense_spot.id, s.spotId); assert.equal(locked.dense_spot.unlock_radius_m, 15);
  assert.equal((await single(s.author, s.n.created.post.id)).caption, 'Note 0/0', 'authors read their own notes');
  const far = north(s.centre, 60);
  assert.deepEqual((await s.visitor.call('unlockDenseSpot', { location: fix(far.lat, far.lng, 8) })).unlocked, []);
  assert.equal((await s.visitor.call('unlockDenseSpot', { location: fix(s.centre.lat, s.centre.lng, 8, Date.now() - 20_000) })).reason, 'stale_fix');
  const near = north(s.centre, 12);
  assert.deepEqual((await s.visitor.call('unlockDenseSpot', { location: fix(near.lat, near.lng, 8) })).unlocked, [s.spotId]);
  const open = (await s.visitor.call('readPublicContent', { mode: 'map_group', groupId: `spot:${s.spotId}`,
    location: fix(near.lat, near.lng, 8) })).posts.find(p => p.id === s.n.created.post.id);
  assert.equal(open.locked, undefined); assert.equal(open.caption, 'Note 0/0');
  assert.equal((await single(s.visitor, s.n.created.post.id)).locked, true, 'a previous unlock cannot open note text remotely');
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 31 }, { merge: true });
  const other = await denseSpot(30);
  assert.equal((await single(other.visitor, other.n.created.post.id)).locked, true, 'note access is independent of the dense-alert threshold');
  await adminDb.collection('system').doc('place_notes').set({ dense_threshold: 30 }, { merge: true });
});

test('ten-note map groups expose only a count remotely and all notes by likes on site', async () => {
  const s = await actualSpot(10);
  const groupId = `spot:${s.spotId}`;
  const summaries = await s.visitor.call('readPublicContent', { mode: 'map_groups', latitude: s.centre.lat, longitude: s.centre.lng, radiusMeters: 150 });
  assert.equal(summaries.summaryVersion, 1);
  assert.equal(summaries.complete, true);
  assert.deepEqual(summaries.coverage, { latitude: s.centre.lat, longitude: s.centre.lng, radiusMeters: 150 });
  const group = summaries.groups.find(g => g.id === groupId);
  assert.equal(group.count, 10);
  assert.equal(group.post_ids.length, 10);
  assert.equal(group.caption, undefined); assert.equal(group.creator_id, undefined);
  const docs = await adminDb.collection('posts').where('spot_id', '==', s.spotId).get();
  for (let index = 0; index < docs.size; index++) await docs.docs[index].ref.update({ likes_count: index });
  const read = location => s.visitor.call('readPublicContent', { mode: 'map_group', groupId, location });
  const remote = await read(fix(north(s.centre, 100).lat, s.centre.lng));
  assert.equal(remote.posts.length, 10);
  assert.ok(remote.posts.every(p => p.locked && p.caption === '' && p.edit_data.layers.length === 0));
  const near = await read(fix(s.centre.lat, s.centre.lng));
  assert.equal(near.total, 10); assert.equal(near.nextOffset, null);
  assert.deepEqual(near.posts.map(p => p.likes_count), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.ok(near.posts.every(p => !p.locked && p.caption));
  assert.ok((await read(fix(s.centre.lat, s.centre.lng, 6, Date.now() - 20_000))).posts.every(p => p.locked), 'stale fixes never reveal text');
  assert.ok((await read(fix(s.centre.lat, s.centre.lng, 60))).posts.every(p => p.locked), 'poor GPS never reveals text');
  assert.ok((await read(undefined)).posts.every(p => p.locked), 'zoom/viewport alone cannot unlock text');
  const block = adminDb.collection('user_blocks').doc(`${s.visitor.luid}_${s.author.luid}`);
  await block.set({ blocker_id: s.visitor.luid, blocked_id: s.author.luid });
  assert.equal((await read(fix(s.centre.lat, s.centre.lng))).posts.length, 10, 'identity blocks must not reveal an anonymous author through map groups');
  await block.delete();
  const mute = adminDb.collection('anonymous_blocks').doc(`${s.visitor.luid}_${s.author.luid}`);
  await mute.set({ blocker_id: s.visitor.luid, blocked_id: s.author.luid });
  assert.equal((await read(fix(s.centre.lat, s.centre.lng))).posts.length, 0, 'the viewer\'s own anonymous mute hides the group content');
  await mute.delete();
});

test('a group larger than the old nearby limit pages every visible note without omissions', async () => {
  const s = await actualSpot(120);
  const ids = [];
  let offset = 0, pageToken;
  do {
    const pageSize = offset === 0 ? 15 : 50;
    const page = await s.visitor.call('readPublicContent', { mode: 'map_group', groupId: `spot:${s.spotId}`,
      offset, pageToken, pageSize, location: fix(s.centre.lat, s.centre.lng) });
    assert.equal(page.total, 120);
    assert.equal(page.posts.length, Math.min(pageSize, 120 - offset));
    ids.push(...page.posts.map(p => p.id));
    offset = page.nextOffset; pageToken = page.pageToken;
  } while (offset != null);
  assert.equal(ids.length, 120); assert.equal(new Set(ids).size, 120);
});

test('group pagination freezes ranking but rechecks access, token ownership and live visibility', async () => {
  const s = await actualSpot(60), groupId = `spot:${s.spotId}`;
  const docs = (await adminDb.collection('posts').where('spot_id', '==', s.spotId).get()).docs;
  for (let index = 0; index < docs.length; index++) await docs[index].ref.update({ likes_count: index });
  const read = (offset, pageToken, location = fix(s.centre.lat, s.centre.lng), user = s.visitor) =>
    user.call('readPublicContent', { mode: 'map_group', groupId, offset, pageToken, location });
  const first = await read(0);
  assert.ok(first.pageToken); assert.equal(first.posts.length, 50);
  const promoted = docs[0]; assert.ok(!first.posts.some(post => post.id === promoted.id));
  await promoted.ref.update({ likes_count: 1000 });
  const second = await read(first.nextOffset, first.pageToken);
  const ids = [...first.posts, ...second.posts].map(post => post.id);
  assert.equal(ids.length, 60); assert.equal(new Set(ids).size, 60); assert.ok(ids.includes(promoted.id));
  assert.equal(second.nextOffset, null);
  assert.ok((await read(50, first.pageToken, fix(north(s.centre, 100).lat, s.centre.lng))).posts.every(post => post.locked));
  const other = await newAnonymousUser();
  assert.equal((await expectFailure(read(50, first.pageToken, undefined, other))).code, 'functions/failed-precondition');
  assert.equal((await expectFailure(read(50))).code, 'functions/invalid-argument');
  const mute = adminDb.collection('anonymous_blocks').doc(`${s.visitor.luid}_${s.author.luid}`);
  await mute.set({ blocker_id: s.visitor.luid, blocked_id: s.author.luid });
  assert.equal((await read(50, first.pageToken)).posts.length, 0, 'a snapshot never bypasses a newer anonymous mute');
  await mute.delete();
  await promoted.ref.update({ status: 'removed' });
  assert.ok((await read(50, first.pageToken)).posts.every(post => post.id !== promoted.id), 'removed notes are not retained in a snapshot');
  await adminDb.collection('map_group_sessions').doc(first.pageToken).update({ expires_at: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await expectFailure(read(50, first.pageToken))).code, 'functions/failed-precondition');
});

test('a small summary resolves current members after its anchor joins a persistent spot', async () => {
  const f = await fixture(), second = await note(f.author, f.point);
  const summary = await f.visitor.call('readPublicContent', { mode: 'map_groups', latitude: f.point.lat, longitude: f.point.lng, radiusMeters: 100 });
  const group = summary.groups.find(g => g.post_ids.includes(f.n.ref.id));
  assert.equal(group.count, 2); assert.ok(group.id.startsWith('post:'));
  const refs = [f.n.ref, second.ref];
  for (let index = 0; index < 3; index++) refs.push((await note(f.author, f.point)).ref);
  await eventually(async () => typeof (await f.n.ref.get()).get('spot_id') === 'string', 'group promoted to persistent spot');
  const current = await f.visitor.call('readPublicContent', { mode: 'map_group', groupId: group.id, postIds: group.post_ids,
    location: fix(f.point.lat, f.point.lng) });
  assert.equal(current.total, 5); assert.equal(current.posts.length, 5);
  assert.ok(current.group.id.startsWith('spot:')); assert.ok(current.posts.every(post => !post.locked));
});

test('location-note access uses the current singleton after other spot members are removed', async () => {
  const f = await fixture(), refs = [f.n.ref];
  for (let index = 0; index < 4; index++) refs.push((await note(f.author, north(f.point, 24))).ref);
  await eventually(async () => typeof (await f.n.ref.get()).get('spot_id') === 'string', 'spot formed');
  const spotId = (await f.n.ref.get()).get('spot_id');
  for (const ref of refs.slice(1)) { await ref.update({ status: 'removed' }); await syncSpotMembership(ref.id); }
  await repairSpotCount(spotId);
  const read = location => f.visitor.call('readPublicContent', { mode: 'map_group', groupId: `spot:${spotId}`, location });
  const far = await read(fix(north(f.point, 35).lat, f.point.lng, 5));
  assert.equal(far.group.count, 1); assert.equal(far.group.radius, 0);
  assert.equal(far.posts[0].locked, true); assert.equal(far.posts[0].caption, '');
  assert.equal((await read(fix(f.point.lat, f.point.lng, 5))).posts[0].caption, f.n.body.text);
});

test('a single location note stays closed outside its own radius without waiting for spot membership', async () => {
  const f = await fixture();
  const id = f.n.created.post.id;
  assert.equal((await single(f.visitor, id)).locked, true);
  const read = location => f.visitor.call('readPublicContent', { mode: 'map_group', groupId: `post:${id}`, postIds: [id], location });
  assert.equal((await read(fix(f.point.lat, f.point.lng))).posts[0].caption, f.n.body.text);
  assert.equal((await read(undefined)).posts[0].locked, true);
});

test('a small real group opens all of its notes on site before it has persistent spot membership', async () => {
  const f = await fixture(), other = await note(f.author, north(f.point, 24));
  const ids = [f.n.created.post.id, other.created.post.id];
  const read = location => f.visitor.call('readPublicContent', { mode: 'map_group', groupId: `post:${ids[0]}`, postIds: ids, location });
  const near = await read(fix(f.point.lat, f.point.lng));
  assert.equal(near.posts.length, 2);
  assert.ok(near.posts.every(p => !p.locked), 'reading applies to the real place, not only the note nearest the visitor');
  assert.ok((await read(undefined)).posts.every(p => p.locked));
  const singleHint = await f.visitor.call('readPublicContent', { mode: 'map_group', groupId: `post:${ids[0]}`, postIds: [ids[0]], location: fix(f.point.lat, f.point.lng) });
  assert.equal(singleHint.total, 2, 'a side-panel singleton must discover the full real group');
  await f.n.ref.delete();
  const recovered = await read(fix(north(f.point, 24).lat, f.point.lng));
  assert.equal(recovered.total, 1); assert.equal(recovered.group.id, `post:${ids[1]}`);
  assert.equal(recovered.posts[0].locked, undefined, 'a deleted anchor cannot strand the remaining note');
});

test('entering a dense spot sends one text-free alert, and the region list advertises unalerted spots', async () => {
  const s = await denseSpot(42);
  const regions = (await s.visitor.call('readPlaceNoteRegions', { location: fix(s.centre.lat, s.centre.lng, 30) })).regions;
  const region = regions.find(r => r.spot === s.spotId);
  assert.ok(region); assert.equal(region.kind, 'place_note'); assert.ok(region.triggerRadius >= 25);
  const visit = () => s.visitor.call('recordPlaceNoteVisit', { location: fix(s.centre.lat, s.centre.lng, 8), confirmationStartedAt: Date.now() - 11_000 });
  const alert = await visit();
  assert.equal(alert.notify, true); assert.equal(alert.kind, 'dense_spot'); assert.equal(alert.total, 42); assert.equal(alert.body, undefined);
  assert.equal((await visit()).notify, false, 'once per 30 days');
  assert.equal((await s.visitor.call('readPlaceNoteRegions', { location: fix(s.centre.lat, s.centre.lng, 30) })).regions.some(r => r.spot === s.spotId), false);
});

test('an approved note inside a locked dense spot is announced without its text, and stays closed in activity', async () => {
  const s = await denseSpot(30);
  await s.n.ref.update({ push_state: 'approved' });
  const r = await s.visitor.call('recordPlaceNoteVisit', { location: fix(s.centre.lat, s.centre.lng, 8), confirmationStartedAt: Date.now() - 11_000 });
  assert.equal(r.notify, true); assert.equal(r.kind, 'dense_spot'); assert.equal(r.body, undefined); assert.equal(r.total, 30);
  const item = (await s.visitor.call('readActivity')).items.find(i => i.id === r.activityId);
  assert.equal(item.body, '', 'activity keeps the note closed');
});

test('likes from established accounts approve a note for notifications; reports from distinct users hide it', async () => {
  const f = await fixture();
  const likers = await Promise.all([newUser(), newUser(), newUser()]);
  const old = Timestamp.fromMillis(Date.now() - 3 * 86_400_000);
  for (const u of likers.slice(0, 2)) await adminDb.collection('profiles').doc(u.luid).update({ created_at: old });
  for (const u of likers) await adminDb.collection('likes').doc(`${f.n.created.post.id}_${u.luid}`).set({ post_id: f.n.created.post.id, user_id: u.luid, created_at: Timestamp.now() });
  await eventually(async () => (await f.n.ref.get()).get('likes_count') === 3, 'likes counted');
  await new Promise(r => setTimeout(r, 1500));
  assert.equal((await f.n.ref.get()).get('push_state'), 'none', 'a one-day-old account does not count yet');
  await adminDb.collection('profiles').doc(likers[2].luid).update({ created_at: old });
  const extra = await newUser(); await adminDb.collection('profiles').doc(extra.luid).update({ created_at: old });
  await adminDb.collection('likes').doc(`${f.n.created.post.id}_${extra.luid}`).set({ post_id: f.n.created.post.id, user_id: extra.luid, created_at: Timestamp.now() });
  await eventually(async () => (await f.n.ref.get()).get('push_state') === 'approved', 'auto approved');
  assert.equal((await f.n.ref.get()).get('push_approved_by'), 'system:likes');
  for (const u of likers) await adminDb.collection('moderation_flags').doc(randomUUID()).set({ post_id: f.n.created.post.id, user_id: u.luid, reason: 'spam', status: 'open' });
  await eventually(async () => (await f.n.ref.get()).get('status') === 'flagged', 'auto hidden');
  assert.equal((await f.n.ref.get()).get('push_state'), 'revoked');
});
