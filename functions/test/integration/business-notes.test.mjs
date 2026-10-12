import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newAnonymousUser, newUser, expectFailure } from './_harness.mjs';
after(closeClients);
let fixtureIndex = 0;
const location = f => ({ lat: f.body.lat, lng: f.body.lng, accuracy: 0.5, measuredAt: Date.now() });
async function fixture() {
  const author = await newAnonymousUser(), visitor = await newAnonymousUser();
  const body = { clientMutationId: randomUUID(), name: 'Cafe ' + randomUUID(), lat: -12.1234 + fixtureIndex++ * 0.05, lng: -77.1234, text: 'Do not order the cold soup.' };
  const created = await author.call('createPlaceNote', body), ref = adminDb.collection('posts').doc(created.post.id);
  const pref = await visitor.call('readDataPreferences');
  await visitor.call('setDataPreferences', { telemetry: false, location: false, revision: pref.revision, noticeVersion: '2026-10-11', placeNotes: true, placeNotesNoticeVersion: '2026-10-11-place-notes' });
  return { author, visitor, body, created, ref, business: (await ref.get()).get('business_note') };
}
test('map notes are anonymous pending text posts with normal protected-zone gates and immutable replay', async () => {
  const f = await fixture();
  assert.equal(f.created.publishStatus, 'pending_review'); const stored = (await f.ref.get()).data();
  assert.equal(stored.is_anonymous, true); assert.equal(stored.placement_state, 'free_space_approximate'); assert.equal(stored.native_provider, null);
  assert.equal(stored.note_kind, 'business'); assert.equal(stored.multi_user_ready, false);
  assert.equal((await f.author.call('createPlaceNote', f.body)).idempotentReplay, true);
  assert.equal((await expectFailure(f.author.call('createPlaceNote', { ...f.body, text: 'Changed text' }))).code, 'functions/already-exists');
  assert.equal((await expectFailure(f.author.call('createPlaceNote', { ...f.body, clientMutationId: randomUUID(), text: 'See https://example.com' }))).code, 'functions/invalid-argument');
  const zone = adminDb.collection('protected_zones').doc(randomUUID()); await zone.set({ active: true, name: 'Protected', lat: f.body.lat, lng: f.body.lng, radius_meters: 100 });
  assert.equal((await expectFailure(f.author.call('createPlaceNote', { ...f.body, clientMutationId: randomUUID() }))).code, 'functions/permission-denied');
  await zone.delete();
});
test('only approved notes appear in nearby entry regions and public projection preserves author anonymity', async () => {
  const f = await fixture(), read = () => f.visitor.call('readBusinessNoteRegions', { location: location(f) });
  assert.equal((await read()).regions.some(r => r.id === f.business.id), false);
  await f.ref.update({ status: 'active' });
  const regions = (await read()).regions, region = regions.find(r => r.id === f.business.id);
  assert.equal(region.kind, 'place_note'); assert.equal(region.transition, 'entry'); assert.equal(region.radius, 150); assert.equal(region.triggerRadius, 2.5);
  assert.equal(JSON.stringify(regions).includes(f.author.luid), false);
  const p = (await f.visitor.call('readPublicContent', { mode: 'single', postId: f.created.post.id })).posts[0];
  assert.equal(p.business_note.name, f.body.name); assert.notEqual(p.creator_id, f.author.luid); assert.equal(p.creator_handle, null);
});
test('visit returns the approved note text once across concurrent devices, caps daily visits and never retains location', async () => {
  const f = await fixture(); await f.ref.update({ status: 'active' });
  const body = { businessId: f.business.id, location: location(f) };
  const results = await Promise.all([f.visitor.call('recordBusinessNoteVisit', body), f.visitor.call('recordBusinessNoteVisit', body)]);
  assert.equal(results.filter(r => r.notify).length, 1); const result = results.find(r => r.notify);
  assert.equal(result.body, f.body.text); assert.equal(result.title, f.body.name); assert.equal(result.postId, f.created.post.id);
  assert.equal((await f.visitor.call('readActivity')).items.find(i => i.id === result.activityId).body, f.body.text);
  await f.ref.update({ status: 'flagged' });
  assert.equal((await f.visitor.call('readActivity')).items.some(i => i.id === result.activityId), false);
  await f.ref.update({ status: 'active' });
  assert.equal(JSON.stringify(result).includes(f.author.luid), false);
  assert.equal((await adminDb.collection('user_locations').doc(f.visitor.luid).get()).exists, false);
  const receipts = await adminDb.collection('place_note_notification_receipts').where('owner_luid', '==', f.visitor.luid).get();
  for (const r of receipts.docs) { assert.equal(r.get('lat'), undefined); assert.equal(r.get('lng'), undefined); }
  const other = await fixture(); await other.ref.update({ status: 'active' });
  await adminDb.collection('place_note_push_quota').doc(`${f.visitor.luid}_${new Date().toISOString().slice(0, 10)}`).set({ count: 3, activity_ids: [] });
  assert.equal((await f.visitor.call('recordBusinessNoteVisit', { businessId: other.business.id, location: location(other) })).notify, false);
  await f.visitor.call('deleteAccount');
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('owner_luid', '==', f.visitor.luid).get()).empty, true);
  assert.equal((await adminDb.collection('place_note_push_quota').where('owner_luid', '==', f.visitor.luid).get()).empty, true);
});
test('opt-out, stale/outside/uncertain fixes, blocks, reports and removed or suspended authors prevent alerts', async () => {
  const f = await fixture(); await f.ref.update({ status: 'active' });
  const visit = fix => f.visitor.call('recordBusinessNoteVisit', { businessId: f.business.id, location: fix ?? location(f) });
  assert.equal((await expectFailure(visit({ ...location(f), measuredAt: Date.now() - 120000 }))).code, 'functions/invalid-argument');
  assert.equal((await visit({ ...location(f), lat: f.body.lat + 0.01 })).notify, false);
  assert.equal((await visit({ ...location(f), accuracy: 190 })).notify, false);
  const pref = adminDb.collection('user_data_preferences').doc(f.visitor.luid); await pref.update({ place_notes: false }); assert.equal((await visit()).notify, false);
  await pref.update({ place_notes: true });
  const block = adminDb.collection('anonymous_blocks').doc(`${f.visitor.luid}_${f.author.luid}`); await block.set({ blocker_id: f.visitor.luid, blocked_id: f.author.luid }); assert.equal((await visit()).notify, false); await block.delete();
  const report = adminDb.collection('moderation_flags').doc(randomUUID()); await report.set({ user_id: f.visitor.luid, post_id: f.created.post.id }); assert.equal((await visit()).notify, false); await report.delete();
  await f.ref.update({ status: 'removed' }); assert.equal((await visit()).notify, false); await f.ref.update({ status: 'active' });
  await adminDb.collection('profiles').doc(f.author.luid).update({ suspended: true }); assert.equal((await visit()).notify, false);
});
test('business-note consent requires its own notice and remains independent of marketing consent', async () => {
  const u = await newUser(), base = { telemetry: false, location: false, revision: '', noticeVersion: '2026-10-11', placeNotes: true };
  assert.equal((await u.call('readDataPreferences')).placeNotes, false);
  assert.equal((await expectFailure(u.call('setDataPreferences', base))).code, 'functions/invalid-argument');
  const p = await u.call('setDataPreferences', { ...base, placeNotesNoticeVersion: '2026-10-11-place-notes' });
  assert.equal(p.placeNotes, true); assert.equal(p.promotions, false); assert.equal(p.location, false);
});

test('author account deletion also removes other recipients’ retained note text and per-post notification receipts', async () => {
  const f = await fixture(); await f.ref.update({ status: 'active' });
  const result = await f.visitor.call('recordBusinessNoteVisit', { businessId: f.business.id, location: location(f) });
  assert.equal(result.notify, true);
  await f.author.call('deleteAccount');
  assert.equal((await adminDb.collection('activity_events').doc(result.activityId).get()).exists, false);
  assert.equal((await adminDb.collection('place_note_notification_receipts').where('post_id', '==', f.created.post.id).get()).empty, true);
});

test('coarse wake regions never notify at street distance; poor accuracy and missing entry confirmation suppress unified reminders', async () => {
  const f = await fixture(); await f.ref.update({ status: 'active' });
  const pref = await f.visitor.call('readDataPreferences');
  await f.visitor.call('setDataPreferences', { telemetry: false, location: false, revision: pref.revision, noticeVersion: '2026-10-11', notifications: true, notificationsNoticeVersion: '2026-10-11-notifications' });
  const visit = (fix, confirmationStartedAt) => f.visitor.call('recordBusinessNoteVisit', { businessId: f.business.id, location: fix, confirmationStartedAt });
  assert.equal((await visit(location(f))).notify, false);
  const confirmation = Date.now() - 3000;
  assert.equal((await visit({ ...location(f), accuracy: 5 }, confirmation)).notify, false);
  assert.equal((await visit({ ...location(f), lat: f.body.lat + 0.00005 }, confirmation)).notify, false);
  assert.equal((await visit(location(f), Date.now() - 500)).notify, false);
  assert.equal((await visit({ ...location(f), measuredAt: Date.now() - 4000 }, Date.now() - 3000)).notify, false, 'an old cached fix cannot serve as the second measurement');
  assert.equal((await visit(location(f), confirmation)).notify, true);
});
