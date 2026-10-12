import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { saveBrand, createCampaign, campaignStatus, campaignAudience, queueNotification, campaignInput } = await import('../../lib/campaigns.ts');
const { deliverAdminNotification } = await import('../../../functions/lib/campaigns.js');
const db = adminDb(), reason = 'Campaign infrastructure verification';
after(async () => Promise.all(getApps().map(deleteApp)));
async function fixture(overrides = {}) {
  const actor = 'campaign-admin-' + randomUUID(), author = randomUUID(), recipient = randomUUID(), revision = randomUUID();
  await db.collection('admin_role_assignments').add({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await db.collection('profiles').doc(author).set({ handle: 'brand', admin_managed: true });
  await db.collection('profiles').doc(recipient).set({ handle: 'recipient' });
  await db.collection('user_data_preferences').doc(recipient).set({ location: true, promotions: true, revision });
  await db.collection('user_locations').doc(recipient).set({ owner_luid: recipient, lat: 41, lng: 29, accuracy: 10,
    consent_revision: revision, measured_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  const brand = await saveBrand({ name: 'Test Brand', authorId: author }, actor, reason, randomUUID());
  const input = campaignInput({ brandId: brand.id, name: 'Coffee reward', message: '20% coffee discount', terms: 'Use code LOCI20 at this branch before expiry.',
    lat: 41, lng: 29, radius: 500, minPosts: 1, minLikes: 10, startsAt: Date.now() - 60_000, endsAt: Date.now() + 86_400_000, ...overrides });
  const campaign = await createCampaign(input, actor, reason, randomUUID());
  const postId = randomUUID();
  await db.collection('posts').doc(postId).set({ creator_id: recipient, status: 'active', visibility: 'public', age_rating: 'all',
    likes_count: 12, created_at: Timestamp.now() });
  return { actor, author, recipient, brand: brand.id, campaign: campaign.id, revision, postId };
}
test('campaigns stay drafts, protected zones block approval, pause/expiry stop targeting', async () => {
  const f = await fixture();
  assert.equal((await db.collection('campaigns').doc(f.campaign).get()).get('status'), 'draft');
  await assert.rejects(queueNotification({ recipientId: f.recipient, campaignId: f.campaign }, f.actor, reason, randomUUID()), /not_active/);
  const zone = db.collection('protected_zones').doc(randomUUID());
  await zone.set({ active: true, policy: 'hard_block', lat: 41, lng: 29, radius_meters: 100 });
  await assert.rejects(campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID()), /protected_zone/);
  await zone.delete(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  await campaignStatus(f.campaign, 'paused', f.actor, reason, randomUUID());
  await assert.rejects(queueNotification({ recipientId: f.recipient, campaignId: f.campaign }, f.actor, reason, randomUUID()), /not_active/);
});
test('nearby selection excludes stale/revoked location and artificial likes; assigning and queuing is idempotent', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const find = async () => (await campaignAudience(f.campaign, f.actor, reason)).candidates.find(c => c.luid === f.recipient);
  assert.ok(await find());
  await db.collection('posts').doc(f.postId).update({ likes_count: 1000, metrics_counter_offsets: { likes_count: 995 } });
  assert.equal(await find(), undefined);
  await db.collection('posts').doc(f.postId).update({ metrics_counter_offsets: { likes_count: 0 } });
  await db.collection('user_locations').doc(f.recipient).update({ measured_at: Timestamp.fromMillis(Date.now() - 180_000) });
  assert.equal(await find(), undefined);
  await assert.rejects(queueNotification({ recipientId: f.recipient, campaignId: f.campaign }, f.actor, reason, randomUUID()), /no_longer_eligible/);
  await db.collection('user_locations').doc(f.recipient).update({ measured_at: Timestamp.now() });
  const key = randomUUID(), body = { recipientId: f.recipient, campaignId: f.campaign };
  const [a, b] = await Promise.all([queueNotification(body, f.actor, reason, key), queueNotification(body, f.actor, reason, key)]);
  assert.deepEqual(a, b);
  assert.equal((await db.collection('admin_notification_jobs').where('recipient_id', '==', f.recipient).get()).size, 1);
  assert.equal((await db.collection('activity_events').doc(`admin_${a.id}`).get()).get('post_id'), f.campaign);
  assert.equal((await db.collection('campaign_targets').doc(`${f.campaign}_${f.recipient}`).get()).exists, true);
  assert.equal((await db.collection('posts').doc(f.campaign).get()).exists, false, 'targeted code is not a public post');
  await assert.rejects(queueNotification({ ...body, recipientId: randomUUID() }, f.actor, reason, key), /idempotency_key_reused/);
});
test('manual notifications require opt-in, are capped at three daily jobs, and attempts never duplicate FCM sends', async () => {
  const f = await fixture(), body = { recipientId: f.recipient, title: 'LociAR', message: 'An offer is ready in the app.' };
  await db.collection('user_data_preferences').doc(f.recipient).update({ promotions: false });
  await assert.rejects(queueNotification(body, f.actor, reason, randomUUID()), /opted_in/);
  await db.collection('user_data_preferences').doc(f.recipient).update({ promotions: true });
  const job = await queueNotification(body, f.actor, reason, randomUUID());
  const token = 'fake-campaign-token-' + randomUUID();
  await db.collection('push_tokens').doc(randomUUID()).set({ owner_luid: f.recipient, token, locale: 'tr', expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  let sent = 0;
  const send = async message => { assert.equal(message.token, token); sent++; return 'stub-fcm-acceptance'; };
  await Promise.all([deliverAdminNotification(job.id, send), deliverAdminNotification(job.id, send)]);
  assert.equal(sent, 1);
  assert.equal((await db.collection('admin_notification_jobs').doc(job.id).get()).get('accepted'), 1);
  await queueNotification(body, f.actor, reason, randomUUID()); await queueNotification(body, f.actor, reason, randomUUID());
  await assert.rejects(queueNotification(body, f.actor, reason, randomUUID()), /daily_notification_limit/);
});
test('revocation and changed ownership between queue and send prevent a push', async () => {
  const f = await fixture(), job = await queueNotification({ recipientId: f.recipient, title: 'LociAR', message: 'New message' }, f.actor, reason, randomUUID());
  await db.collection('push_tokens').doc(randomUUID()).set({ owner_luid: f.recipient, token: 'fake-token-' + randomUUID(), locale: 'en', expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  await db.collection('user_data_preferences').doc(f.recipient).update({ promotions: false, revision: randomUUID() });
  let sent = 0; await deliverAdminNotification(job.id, async () => { sent++; return 'stub'; }); assert.equal(sent, 0);
  await db.collection('admin_role_assignments').where('user_id', '==', f.actor).get().then(s => Promise.all(s.docs.map(d => d.ref.update({ revoked_at: Timestamp.now() }))));
  await assert.rejects(createCampaign(campaignInput({ brandId: f.brand, name: 'Denied', message: 'Discount', terms: 'Terms', lat: 0, lng: 0, startsAt: Date.now(), endsAt: Date.now() + 86400000 }), f.actor, reason, randomUUID()), /permission_revoked/);
});
test('campaign dispatch rechecks genuine likes and sends a localized generic notification without the discount code or coordinates', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const body = { recipientId: f.recipient, campaignId: f.campaign };
  const first = await queueNotification(body, f.actor, reason, randomUUID());
  await db.collection('push_tokens').doc(randomUUID()).set({ owner_luid: f.recipient, token: 'fake-campaign-token-' + randomUUID(), locale: 'tr', expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  await db.collection('posts').doc(f.postId).update({ likes_count: 0 });
  let sent = 0;
  assert.equal(await deliverAdminNotification(first.id, async () => { sent++; return 'stub'; }), 0);
  await db.collection('posts').doc(f.postId).update({ likes_count: 12 });
  const next = await queueNotification(body, f.actor, reason, randomUUID());
  await deliverAdminNotification(next.id, async message => {
    sent++; assert.equal(message.notification.body, 'Sana özel bir kampanya var.');
    assert.equal(message.data.post_id, f.campaign); assert.equal(JSON.stringify(message).includes('LOCI20'), false);
    assert.equal(message.data.lat, undefined); return 'stub';
  });
  assert.equal(sent, 1);
});
test('invalid-token failures cannot delete a token transferred to another account during the send', async () => {
  const f = await fixture(), job = await queueNotification({ recipientId: f.recipient, title: 'LociAR', message: 'An update for you' }, f.actor, reason, randomUUID());
  const ref = db.collection('push_tokens').doc(randomUUID()), token = 'fake-transferred-token-' + randomUUID(), newOwner = randomUUID();
  await ref.set({ owner_luid: f.recipient, token, locale: 'en', expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  await deliverAdminNotification(job.id, async () => { await ref.update({ owner_luid: newOwner }); throw Object.assign(new Error('stub'), { code: 'messaging/registration-token-not-registered' }); });
  assert.equal((await ref.get()).get('owner_luid'), newOwner);
  assert.equal((await db.collection('admin_notification_jobs').doc(job.id).get()).get('failed'), 1);
});
test('brand editor membership is revocable and does not confer administrator notification authority', async () => {
  const f = await fixture();
  const input = { brandId: f.brand, name: 'Test Brand', authorId: f.author, memberId: f.recipient };
  await saveBrand(input, f.actor, reason, randomUUID());
  const membership = db.collection('brand_memberships').doc(`${f.brand}_${f.recipient}`);
  assert.equal((await membership.get()).get('active'), true);
  await assert.rejects(queueNotification({ recipientId: f.recipient, title: 'LociAR', message: 'Denied' }, f.recipient, reason, randomUUID()), /permission_revoked/);
  await saveBrand({ ...input, memberState: 'revoked' }, f.actor, reason, randomUUID());
  assert.equal((await membership.get()).get('active'), false);
});

test('map-only and arrival assignments do not send immediately; arrival requires separate consent and keeps its admission receipt', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const body = { recipientId: f.recipient, campaignId: f.campaign };
  await assert.rejects(queueNotification({ ...body, notificationMode: 'arrival' }, f.actor, reason, randomUUID()), /opted_in_to_arrivals/);
  await queueNotification({ ...body, notificationMode: 'map' }, f.actor, reason, randomUUID());
  assert.equal((await db.collection('admin_notification_jobs').where('recipient_id', '==', f.recipient).get()).empty, true);
  const ref = db.collection('campaign_targets').doc(`${f.campaign}_${f.recipient}`);
  assert.equal((await ref.get()).get('notification_mode'), 'map');
  await db.collection('user_data_preferences').doc(f.recipient).update({ arrivals: true });
  const key = randomUUID(); const arrival = { ...body, notificationMode: 'arrival' };
  assert.deepEqual(await queueNotification(arrival, f.actor, reason, key), await queueNotification(arrival, f.actor, reason, key));
  assert.equal((await ref.get()).get('notification_mode'), 'arrival');
  await ref.update({ arrival_notified_at: Timestamp.now() });
  await queueNotification(arrival, f.actor, reason, randomUUID()); assert.ok((await ref.get()).get('arrival_notified_at'));
  assert.equal((await db.collection('promotion_push_quota').where('owner_luid', '==', f.recipient).get()).empty, true);
  assert.equal((await db.collection('activity_events').where('recipient_id', '==', f.recipient).get()).empty, true);
});

test('changing a queued offer to map-only prevents the earlier immediate push', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const body = { recipientId: f.recipient, campaignId: f.campaign };
  const queued = await queueNotification(body, f.actor, reason, randomUUID());
  await queueNotification({ ...body, notificationMode: 'map' }, f.actor, reason, randomUUID());
  await db.collection('push_tokens').doc(randomUUID()).set({ owner_luid: f.recipient, token: 'fake-mode-token-' + randomUUID(), locale: 'tr', expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  let sent = 0; await deliverAdminNotification(queued.id, async () => { sent++; return 'stub'; });
  assert.equal(sent, 0);
});

test('departure assignment requires separate consent, captures a fresh origin for at most 24 hours and remains idempotent', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const body = { recipientId: f.recipient, campaignId: f.campaign, notificationMode: 'departure', departureRadius: 150,
    title: 'Kızılay AVM', message: 'Bugün sana özel indirim var.' };
  await assert.rejects(queueNotification(body, f.actor, reason, randomUUID()), /opted_in_to_departures/);
  await db.collection('user_data_preferences').doc(f.recipient).update({ departures: true, departures_revision: randomUUID() });
  const key = randomUUID(); assert.deepEqual(await queueNotification(body, f.actor, reason, key), await queueNotification(body, f.actor, reason, key));
  const region = db.collection('campaign_departure_regions').doc(`${f.campaign}_${f.recipient}`), data = (await region.get()).data();
  assert.equal(data.lat, 41); assert.equal(data.lng, 29); assert.equal(data.radius, 150); assert.ok(data.expires_at.toMillis() <= Date.now() + 86400000);
  assert.equal((await db.collection('admin_notification_jobs').where('recipient_id', '==', f.recipient).get()).empty, true);
  await queueNotification({ ...body, notificationMode: 'map' }, f.actor, reason, randomUUID()); assert.equal((await region.get()).exists, false);
  await db.collection('user_locations').doc(f.recipient).update({ measured_at: Timestamp.fromMillis(Date.now() - 180000) });
  await assert.rejects(queueNotification(body, f.actor, reason, randomUUID()), /no_longer_eligible/);
});

test('campaign immediate push uses moderated custom title and message while retaining the private offer link', async () => {
  const f = await fixture(); await campaignStatus(f.campaign, 'active', f.actor, reason, randomUUID());
  const body = { recipientId: f.recipient, campaignId: f.campaign, title: 'Kızılay AVM', message: 'Bugün sana özel indirim var.' };
  await assert.rejects(queueNotification({ ...body, message: 'Visit https://example.com' }, f.actor, reason, randomUUID()), /links/);
  const job = await queueNotification(body, f.actor, reason, randomUUID());
  await db.collection('push_tokens').doc(randomUUID()).set({ owner_luid: f.recipient, token: 'fake-custom-token-' + randomUUID(), locale: 'tr', expires_at: Timestamp.fromMillis(Date.now() + 86400000) });
  let sent = 0; await deliverAdminNotification(job.id, async m => {
    sent++; assert.equal(m.notification.title, body.title); assert.equal(m.notification.body, body.message); assert.equal(m.data.post_id, f.campaign); return 'stub';
  });
  assert.equal(sent, 1); assert.equal((await db.collection('activity_events').doc(`admin_${job.id}`).get()).get('body'), body.message);
});
