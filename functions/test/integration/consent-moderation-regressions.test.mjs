import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newUser } from './_harness.mjs';
import { autoHideReported } from '../../lib/noteAutomation.js';
import { deliverActivityPush, deliverPostApprovedPush } from '../../lib/push.js';
import { Timestamp } from '../../lib/core.js';
import { encodeGeohash } from '../../lib/geo.js';

let previous;
before(async () => { previous = (await adminDb.collection('system').doc('place_notes').get()).data(); });
after(async () => {
  const ref = adminDb.collection('system').doc('place_notes');
  if (previous) await ref.set(previous); else await ref.delete();
});
after(closeClients);

test('social and approval pushes require an explicit notification opt-in before any send or receipt', async () => {
  const recipient = await newUser(), actor = await newUser(), postId = randomUUID(), activityId = randomUUID();
  await recipient.call('registerPushToken', { userId: recipient.luid, installationId: randomUUID(),
    token: `synthetic-fcm-${randomUUID()}-${randomUUID()}`, locale: 'en' });
  await adminDb.collection('posts').doc(postId).set({ creator_id: recipient.luid, status: 'active', visibility: 'public' });
  await adminDb.collection('activity_events').doc(activityId).set({ actor_id: actor.luid, recipient_id: recipient.luid,
    post_id: postId, kind: 'like', read_at: null });
  const pref = adminDb.collection('user_data_preferences').doc(recipient.luid), sent = [];
  const send = async message => { sent.push(message); return 'synthetic-message'; };
  for (const value of [undefined, null, false, 'true']) {
    if (value === undefined) await pref.delete(); else await pref.set({ notifications: value });
    assert.equal(await deliverActivityPush(activityId, send), 0, `social consent: ${value}`);
    assert.equal(await deliverPostApprovedPush(postId, send), 0, `approval consent: ${value}`);
    assert.equal((await adminDb.collection('push_delivery_receipts').where('owner_luid', '==', recipient.luid).get()).size, 0);
  }
  await pref.set({ notifications: true });
  assert.equal(await deliverActivityPush(activityId, send), 1);
  assert.equal(await deliverPostApprovedPush(postId, send), 1);
  assert.equal(sent.length, 2);
});

test('reports about comments or users do not hide the parent post', async () => {
  const postId = randomUUID();
  await adminDb.collection('system').doc('place_notes').set({ report_hide_threshold: 3 });
  const ref = adminDb.collection('posts').doc(postId);
  await ref.set({ creator_id: randomUUID(), status: 'active', push_state: 'approved' });
  const batch = adminDb.batch();
  for (const metadata of [{ target: 'comment', comment_id: randomUUID() }, { comment_id: randomUUID() }, { target: 'user' }]) {
    batch.set(adminDb.collection('moderation_flags').doc(randomUUID()), {
      post_id: postId, user_id: randomUUID(), reason: 'spam', status: 'open', metadata });
  }
  await batch.commit();
  assert.equal(await autoHideReported(postId), false);
  assert.equal((await ref.get()).get('status'), 'active');
});

test('duplicate and comment reports cannot starve later distinct post reporters', async () => {
  const postId = randomUUID(), author = randomUUID(), duplicateReporter = randomUUID();
  await adminDb.collection('system').doc('place_notes').set({ report_hide_threshold: 3 });
  const ref = adminDb.collection('posts').doc(postId);
  await ref.set({ creator_id: author, status: 'active', push_state: 'approved' });
  const batch = adminDb.batch();
  for (let i = 0; i < 220; i++) batch.set(adminDb.collection('moderation_flags').doc(`audit_${postId}_a${String(i).padStart(3, '0')}`), {
    post_id: postId, user_id: duplicateReporter, reason: 'spam', status: 'open' });
  for (let i = 0; i < 2; i++) batch.set(adminDb.collection('moderation_flags').doc(`audit_${postId}_z${i}`), {
    post_id: postId, user_id: randomUUID(), reason: 'spam', status: 'open' });
  await batch.commit();
  assert.equal(await autoHideReported(postId), true);
  assert.equal((await ref.get()).get('status'), 'flagged');
  assert.equal((await ref.get()).get('push_state'), 'revoked');
});

test('comment reports preserve note regions, notification visits and activity; a later post report hides them', async () => {
  const author = await newUser(), viewer = await newUser(), postId = randomUUID(), lat = -61, lng = 110;
  const ref = adminDb.collection('posts').doc(postId);
  await ref.set({ creator_id: author.luid, status: 'active', visibility: 'public', age_rating: 'all', is_anonymous: true,
    note_kind: 'location', caption: 'A location note', push_state: 'approved', notify_radius_m: 30,
    lat, lng, geohash: encodeGeohash(lat, lng), created_at: Timestamp.now() });
  await adminDb.collection('user_data_preferences').doc(viewer.luid).set({ notifications: true, place_notes: true });
  const batch = adminDb.batch();
  for (let i = 0; i < 205; i++) batch.set(adminDb.collection('moderation_flags').doc(`audit_${postId}_a${String(i).padStart(3, '0')}`), {
    post_id: postId, user_id: viewer.luid, reason: 'spam', status: 'open', metadata: { target: 'comment', comment_id: randomUUID() } });
  const activityId = randomUUID();
  batch.set(adminDb.collection('activity_events').doc(activityId), { kind: 'place_note', anonymous: true,
    actor_id: null, recipient_id: viewer.luid, post_id: postId, body: 'A location note', created_at: Timestamp.now() });
  await batch.commit();
  const location = () => ({ lat, lng, accuracy: 6, measuredAt: Date.now() });
  assert.ok((await viewer.call('readPlaceNoteRegions', { location: location() })).regions.some(region => region.id === postId));
  assert.ok((await viewer.call('readActivity', {})).items.some(item => item.id === activityId));
  const deliveryId = randomUUID();
  assert.equal((await viewer.call('recordPlaceNoteVisit', { deliveryId, location: location(), confirmationStartedAt: Date.now() - 11_000 })).notify, true);
  await adminDb.collection('moderation_flags').doc(`audit_${postId}_z`).set({ post_id: postId, user_id: viewer.luid, reason: 'spam', status: 'open' });
  assert.equal((await viewer.call('readActivity', {})).items.some(item => item.id === activityId), false);
  assert.equal((await viewer.call('recordPlaceNoteVisit', { deliveryId, location: location(), confirmationStartedAt: Date.now() - 11_000 })).notify, false);
});
