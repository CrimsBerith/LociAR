import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newUser, newAnonymousUser, expectFailure } from './_harness.mjs';
after(closeClients);

test('brand membership can submit only an idempotent draft; no audience or notification authority is granted', async () => {
  const editor = await newUser(), stranger = await newUser(), anonymous = await newAnonymousUser(), brandId = randomUUID();
  await adminDb.collection('brands').doc(brandId).set({ status: 'active', name: 'Test Brand', author_luid: editor.luid });
  await adminDb.collection('brand_memberships').doc(`${brandId}_${editor.luid}`).set({ brand_id: brandId, owner_luid: editor.luid, role: 'editor', active: true });
  const body = { brandId, mutationId: randomUUID(), name: 'Test offer', message: '10% off coffee', terms: 'Use code LOCI10 before expiry.',
    lat: 41, lng: 29, radius: 500, startsAt: Date.now() - 60_000, endsAt: Date.now() + 86_400_000, status: 'active', recipient_id: stranger.luid };
  const result = await editor.call('submitBrandCampaign', body);
  assert.equal(result.status, 'draft'); assert.deepEqual(await editor.call('submitBrandCampaign', body), result);
  const saved = (await adminDb.collection('campaigns').doc(result.id).get()).data();
  assert.equal(saved.status, 'draft'); assert.equal(saved.recipient_id, undefined); assert.equal(saved.post_projection, undefined);
  assert.equal((await expectFailure(editor.call('submitBrandCampaign', { ...body, message: 'Changed offer' }))).code, 'functions/already-exists');
  assert.equal((await expectFailure(stranger.call('submitBrandCampaign', { ...body, mutationId: randomUUID() }))).code, 'functions/permission-denied');
  assert.equal((await expectFailure(anonymous.call('submitBrandCampaign', { ...body, mutationId: randomUUID() }))).code, 'functions/permission-denied');
  assert.equal((await expectFailure(editor.call('submitBrandCampaign', { ...body, mutationId: randomUUID(), message: 'Go to https://example.com' }))).code, 'functions/invalid-argument');
});

test('campaign post projections are recipient-only, sponsored, expiry-gated and never reveal target identities', async () => {
  const author = await newUser(), recipient = await newAnonymousUser(), stranger = await newUser(), id = randomUUID(), brand = randomUUID();
  const projection = { creator_id: author.luid, creator_handle: 'Test Brand', caption: 'Offer', pose_json: JSON.stringify({ latitude: 41, longitude: 29, heading: 0 }),
    edit_data_json: JSON.stringify({ version: 1, layers: [{ id: randomUUID(), type: 'text', text: 'Offer terms' }] }), created_at: Timestamp.now(),
    sponsorship: { brand_name: 'Test Brand', terms: 'LOCI20', expires_at: new Date(Date.now() + 86_400_000).toISOString() } };
  await adminDb.collection('brands').doc(brand).set({ name: 'Test Brand', author_luid: author.luid, status: 'active' });
  await adminDb.collection('campaigns').doc(id).set({ brand_id: brand, status: 'active', starts_at: Timestamp.fromMillis(Date.now() - 1000), ends_at: Timestamp.fromMillis(Date.now() + 86_400_000), post_projection: projection });
  await adminDb.collection('campaign_targets').doc(`${id}_${recipient.luid}`).set({ owner_luid: recipient.luid, campaign_id: id, state: 'assigned', expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  await adminDb.collection('user_data_preferences').doc(recipient.luid).set({ owner_luid: recipient.luid, promotions: true, notifications: true });
  const read = user => user.call('readPublicContent', { mode: 'single', postId: id });
  const post = (await read(recipient)).posts[0]; assert.equal(post.sponsorship.brand_name, 'Test Brand');
  assert.equal(JSON.stringify(post).includes(recipient.luid), false); assert.equal((await read(stranger)).posts.length, 0);
  assert.equal((await recipient.call('readPublicContent', { mode: 'nearby', latitude: 41, longitude: 29, radiusMeters: 500 })).posts.some(p => p.id === id), true);
  const view = await recipient.call('recordPostView', { postId: id }); assert.equal(view.views, 1);
  assert.equal((await recipient.call('recordPostView', { postId: id })).views, 1);
  await adminDb.collection('user_data_preferences').doc(recipient.luid).update({ promotions: false });
  assert.equal((await read(recipient)).posts.length, 0);
  await adminDb.collection('user_data_preferences').doc(recipient.luid).update({ promotions: true });
  await adminDb.collection('campaigns').doc(id).update({ ends_at: Timestamp.fromMillis(Date.now() - 1) });
  assert.equal((await read(recipient)).posts.length, 0);
  await recipient.call('deleteAccount');
  assert.equal((await adminDb.collection('campaign_targets').where('owner_luid', '==', recipient.luid).get()).empty, true);
  assert.equal((await adminDb.collection('campaign_view_receipts').where('owner_luid', '==', recipient.luid).get()).empty, true);
});

async function arrivalFixture() {
  const author = await newUser(), recipient = await newAnonymousUser(), id = randomUUID(), brand = randomUUID(), actor = 'arrival-admin-' + randomUUID();
  await adminDb.collection('brands').doc(brand).set({ name: 'Arrival Brand', author_luid: author.luid, status: 'active' });
  await adminDb.collection('admin_role_assignments').add({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await adminDb.collection('campaigns').doc(id).set({ brand_id: brand, status: 'active', lat: 39.92, lng: 32.85, arrivalRadius: 150,
    starts_at: Timestamp.fromMillis(Date.now() - 1000), ends_at: Timestamp.fromMillis(Date.now() + 86400000),
    post_projection: { creator_id: author.luid, pose_json: JSON.stringify({ latitude: 39.92, longitude: 32.85 }), caption: 'LOCI20' } });
  const target = adminDb.collection('campaign_targets').doc(`${id}_${recipient.luid}`);
  await target.set({ owner_luid: recipient.luid, campaign_id: id, state: 'assigned', notification_mode: 'arrival', assigned_by: actor, expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  await adminDb.collection('user_data_preferences').doc(recipient.luid).set({ owner_luid: recipient.luid, arrivals: true, promotions: true, notifications: true });
  const body = { campaignId: id, locale: 'tr_TR', confirmationStartedAt: Date.now() - 3000, location: { lat: 39.92, lng: 32.85, accuracy: 0.5, measuredAt: Date.now() } };
  return { author, recipient, id, brand, actor, target, body };
}

test('arrival regions are recipient-only; a verified arrival is globally once-only without retaining background coordinates', async () => {
  const f = await arrivalFixture(), stranger = await newUser();
  const regions = (await f.recipient.call('readCampaignRegions')).regions;
  assert.equal(regions[0].id, f.id); assert.equal(regions[0].radius, 150);
  assert.deepEqual((await stranger.call('readCampaignRegions')).regions, []);
  assert.equal((await stranger.call('recordCampaignArrival', f.body)).notify, false);
  const results = await Promise.all([f.recipient.call('recordCampaignArrival', f.body), f.recipient.call('recordCampaignArrival', f.body)]);
  assert.equal(results.filter(r => r.notify).length, 1);
  const notification = results.find(r => r.notify);
  assert.equal(notification.body, 'Sana özel bir kampanya var.'); assert.equal(notification.postId, f.id);
  assert.equal(JSON.stringify(notification).includes('LOCI20'), false);
  assert.deepEqual((await f.recipient.call('readCampaignRegions')).regions, []);
  assert.equal((await adminDb.collection('user_locations').doc(f.recipient.luid).get()).exists, false);
  const saved = (await f.target.get()).data(); assert.equal(saved.lat, undefined); assert.ok(saved.arrival_notified_at);
});

test('arrival rejects stale fixes, outside/uncertain regions, opt-out, expiry, paused brands and changed assignment mode', async () => {
  const f = await arrivalFixture(), arrive = body => f.recipient.call('recordCampaignArrival', body ?? f.body);
  assert.equal((await expectFailure(arrive({ ...f.body, location: { ...f.body.location, measuredAt: Date.now() - 120000 } }))).code, 'functions/invalid-argument');
  assert.equal((await arrive({ ...f.body, location: { ...f.body.location, lat: 39.93 } })).notify, false);
  assert.equal((await arrive({ ...f.body, location: { ...f.body.location, accuracy: 190 } })).notify, false);
  const pref = adminDb.collection('user_data_preferences').doc(f.recipient.luid);
  await pref.update({ arrivals: false }); assert.equal((await arrive()).notify, false);
  await pref.update({ arrivals: true }); await f.target.update({ notification_mode: 'map' }); assert.equal((await arrive()).notify, false);
  await f.target.update({ notification_mode: 'arrival' });
  await adminDb.collection('brands').doc(f.brand).update({ status: 'paused' }); assert.equal((await arrive()).notify, false);
  await adminDb.collection('brands').doc(f.brand).update({ status: 'active' });
  await adminDb.collection('campaigns').doc(f.id).update({ ends_at: Timestamp.fromMillis(Date.now() - 1) }); assert.equal((await arrive()).notify, false);
});

test('arrival shares the daily promotion quota and rechecks the assigning administrator authority', async () => {
  const f = await arrivalFixture(), quota = adminDb.collection('promotion_push_quota').doc(`${f.recipient.luid}_${new Date().toISOString().slice(0, 10)}`);
  await quota.set({ count: 3, activity_ids: ['one', 'two', 'three'] });
  assert.equal((await f.recipient.call('recordCampaignArrival', f.body)).notify, false);
  await quota.delete();
  const roles = await adminDb.collection('admin_role_assignments').where('user_id', '==', f.actor).get();
  await roles.docs[0].ref.update({ revoked_at: Timestamp.now() });
  assert.equal((await f.recipient.call('recordCampaignArrival', f.body)).notify, false);
  await f.recipient.call('deleteAccount'); assert.equal((await f.target.get()).exists, false);
});

async function departureFixture() {
  const f = await arrivalFixture(), revision = randomUUID();
  await f.target.update({ notification_mode: 'departure', notification_title: 'Kızılay AVM', notification_message: 'Bugün sana özel indirim var.' });
  await adminDb.collection('user_data_preferences').doc(f.recipient.luid).update({ departures: true, departures_revision: revision });
  const origin = adminDb.collection('campaign_departure_regions').doc(f.target.id);
  await origin.set({ owner_luid: f.recipient.luid, campaign_id: f.id, lat: 39.921, lng: 32.851, radius: 150, consent_revision: revision, expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  return { ...f, origin, revision, body: { ...f.body, transition: 'exit', location: { ...f.body.location, lat: 39.925, lng: 32.851 } } };
}

test('departure uses a private original area and custom message, admits only a verified exit and clears the origin', async () => {
  const f = await departureFixture();
  const region = (await f.recipient.call('readCampaignRegions')).regions[0];
  assert.equal(region.transition, 'exit'); assert.equal(region.lat, 39.921); assert.notEqual(region.lat, 39.92);
  const arrive = b => f.recipient.call('recordCampaignArrival', b);
  assert.equal((await arrive({ ...f.body, transition: 'entry' })).notify, false);
  assert.equal((await arrive({ ...f.body, location: { ...f.body.location, lat: region.lat, lng: region.lng } })).notify, false);
  assert.equal((await arrive({ ...f.body, location: { ...f.body.location, lat: 39.923, accuracy: 100 } })).notify, false);
  const result = await arrive(f.body);
  assert.equal(result.notify, true); assert.equal(result.title, 'Kızılay AVM'); assert.equal(result.body, 'Bugün sana özel indirim var.');
  assert.equal((await f.origin.get()).exists, false); assert.equal((await f.target.get()).get('movement_event'), 'exit');
  assert.equal((await arrive(f.body)).notify, false);
  assert.equal((await adminDb.collection('user_locations').doc(f.recipient.luid).get()).exists, false);
});

test('departure origins expire after their own window and a changed consent epoch prevents reuse', async () => {
  const f = await departureFixture();
  await f.origin.update({ expires_at: Timestamp.fromMillis(Date.now() - 1) });
  assert.deepEqual((await f.recipient.call('readCampaignRegions')).regions, []);
  assert.equal((await f.recipient.call('recordCampaignArrival', f.body)).notify, false);
  await f.origin.update({ expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  await adminDb.collection('user_data_preferences').doc(f.recipient.luid).update({ departures_revision: randomUUID() });
  assert.deepEqual((await f.recipient.call('readCampaignRegions')).regions, []);
  assert.equal((await f.recipient.call('recordCampaignArrival', f.body)).notify, false);
  await f.recipient.call('deleteAccount'); assert.equal((await f.origin.get()).exists, false);
});

test('arrival also accepts approved custom campaign notification text', async () => {
  const f = await arrivalFixture();
  await f.target.update({ notification_title: 'Kızılay AVM', notification_message: 'Kızılay AVM’de bugün sana özel indirim var.' });
  const result = await f.recipient.call('recordCampaignArrival', f.body);
  assert.equal(result.body, 'Kızılay AVM’de bugün sana özel indirim var.');
  assert.equal((await adminDb.collection('activity_events').doc(result.activityId).get()).get('body'), result.body);
});

test('campaign entry uses the GPS-tolerant 15-100 m rule and still requires fresh distinct confirmation fixes', async () => {
  const f = await arrivalFixture();
  await adminDb.collection('user_data_preferences').doc(f.recipient.luid).update({ notifications: true });
  const regions = (await f.recipient.call('readCampaignRegions')).regions;
  assert.equal(regions[0].triggerRadius, 30, 'default entry radius');
  const arrive = (fix, confirmationStartedAt = Date.now() - 3000) => f.recipient.call('recordCampaignArrival', {
    ...f.body, location: { ...f.body.location, measuredAt: Date.now(), ...fix }, confirmationStartedAt,
  });
  assert.equal((await arrive({ accuracy: 40 })).notify, false, 'fixes worse than 35 m never count');
  assert.equal((await arrive({ lat: 39.9206, accuracy: 8 })).notify, false, '~67 m away is outside 30 m + 8 m');
  assert.equal((await arrive({ measuredAt: Date.now() - 15000 }, Date.now() - 20000)).notify, false);
  assert.equal((await arrive({ measuredAt: Date.now() - 4000 })).notify, false);
  assert.equal((await f.recipient.call('recordCampaignArrival', { ...f.body, confirmationStartedAt: undefined })).notify, false);
  // Passing ~35 m from the shop with a typical 8 m fix is inside 30 m + 8 m.
  assert.equal((await arrive({ lat: 39.92032, accuracy: 8 })).notify, true);
});


test('assigned campaign alerts require global notification consent without consuming arrival or quota', async () => {
  const f = await arrivalFixture(), pref = adminDb.collection('user_data_preferences').doc(f.recipient.luid);
  for (const value of [null, false, 'true']) {
    await pref.update({ notifications: value });
    assert.deepEqual((await f.recipient.call('readCampaignRegions')).regions, []);
    assert.equal((await f.recipient.call('recordCampaignArrival', f.body)).notify, false);
    assert.equal((await f.target.get()).get('arrival_notified_at'), undefined);
    assert.equal((await adminDb.collection('promotion_push_quota').where('owner_luid', '==', f.recipient.luid).get()).size, 0);
  }
  await pref.update({ notifications: true });
  const result = await f.recipient.call('recordCampaignArrival', { ...f.body, confirmationStartedAt: Date.now() - 3000, location: { ...f.body.location, measuredAt: Date.now() } });
  assert.equal(result.notify, true);
});
