import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newAnonymousUser, newUser } from './_harness.mjs';
after(closeClients);

const M = 1 / 111_320;
let index = 0;
const fix = (lat, lng, accuracy = 8, measuredAt = Date.now()) => ({ lat, lng, accuracy, measuredAt });

/** "Moda party": leave the usual place within 5 km → invite; enter the party street → unique beer code. */
async function partyFixture(stepOverrides = {}) {
  const author = await newUser(), user = await newAnonymousUser(), id = randomUUID(), brand = randomUUID();
  const lat = -20.5 + index++ * 0.2, lng = 30;
  await adminDb.collection('brands').doc(brand).set({ name: 'Moda Party', author_luid: author.luid, status: 'active' });
  const steps = [
    { id: 's1', trigger: 'leave_usual_place', channels: { push: true, map: false, ar: false }, title: 'Moda Party', message: 'Party in Moda tonight, come!',
      code: { kind: 'none' }, frequency: { kind: 'once' } },
    { id: 's2', trigger: 'enter', requires: 's1', withinMinutes: 360, zone: { kind: 'street', points: [{ lat, lng }, { lat, lng: lng + 150 * M }], width: 20 },
      channels: { push: true, map: true, ar: true }, title: 'Moda Party', message: 'Free beer with this code', code: { kind: 'unique', prefix: 'BEER' },
      frequency: { kind: 'once' }, budget: 2, ...stepOverrides },
  ];
  await adminDb.collection('campaigns').doc(id).set({ brand_id: brand, audience: 'zone', status: 'active', lat, lng, radius: 5_000, timezone: 'Europe/Istanbul', steps: JSON.parse(JSON.stringify(steps)),
    starts_at: Timestamp.fromMillis(Date.now() - 1000), ends_at: Timestamp.fromMillis(Date.now() + 86_400_000),
    post_projection: { creator_id: author.luid, pose_json: JSON.stringify({ latitude: lat, longitude: lng }), caption: 'Moda Party', visibility: 'private',
      sponsorship: { brand_name: 'Moda Party', terms: 'One per person', expires_at: new Date(Date.now() + 86_400_000).toISOString() } } });
  await adminDb.collection('user_data_preferences').doc(user.luid).set({ owner_luid: user.luid, promotions: true, notifications: true, arrivals: true, departures: true });
  const home = fix(lat + 2_000 * M, lng, 40);
  const step = (stepId, f, extra = {}) => user.call('recordCampaignStep', { campaignId: id, stepId, location: f, ...extra });
  return { author, user, id, lat, lng, home, step };
}

test('leaving the usual place sends the invite; entering the street then issues a unique code once', async () => {
  const p = await partyFixture();
  const zones = (await p.user.call('readCampaignZones', { location: p.home })).regions;
  assert.deepEqual(zones.map(z => z.stepId), ['s1'], 'the follow-up step is hidden until the invite is received');
  assert.equal(zones[0].area.radius, 5_000); assert.equal(zones[0].kind, 'campaign_step');
  const early = await p.step('s2', fix(p.lat, p.lng + 50 * M), { confirmationStartedAt: Date.now() - 3_000 });
  assert.equal(early.reason, 'requires_previous_step');
  const invite = await p.step('s1', p.home);
  assert.equal(invite.notify, true); assert.equal(invite.body, 'Party in Moda tonight, come!'); assert.equal(invite.code, null);
  assert.equal((await p.step('s1', p.home)).reason, 'frequency');
  const next = (await p.user.call('readCampaignZones', { location: p.home })).regions;
  assert.deepEqual(next.map(z => z.stepId), ['s2']); assert.equal(next[0].zone.kind, 'street');
  assert.equal((await p.step('s2', fix(p.lat + 60 * M, p.lng + 50 * M), { confirmationStartedAt: Date.now() - 3_000 })).reason, 'not_inside', 'parallel street');
  assert.equal((await p.step('s2', fix(p.lat, p.lng + 50 * M), { confirmationStartedAt: Date.now() - 500 })).reason, 'unconfirmed');
  const beer = await p.step('s2', fix(p.lat + 12 * M, p.lng + 50 * M), { confirmationStartedAt: Date.now() - 3_000 });
  assert.equal(beer.notify, true); assert.match(beer.code, /^BEER-[A-Z2-9]{6}$/); assert.equal(beer.postId, p.id);
  assert.equal((await adminDb.collection('campaign_codes').doc(beer.code).get()).get('owner_luid'), p.user.luid);
  const offer = (await p.user.call('readPublicContent', { mode: 'single', postId: p.id })).posts[0];
  assert.deepEqual(offer.sponsorship.codes, [beer.code], 'the code is on the private offer card (map and AR)');
  const activity = (await p.user.call('readActivity')).items.find(i => i.id === beer.activityId);
  assert.ok(activity.body.includes(beer.code));
  const stats = await adminDb.collection('campaign_step_stats').doc(`${p.id}_s2`).get();
  assert.equal(stats.get('sent'), 1);
});

test('budget, schedule, dwell, exit, consent and kill switch are enforced by the server', async () => {
  const p = await partyFixture({ requires: undefined, withinMinutes: undefined, budget: 1 });
  await adminDb.collection('campaigns').doc(p.id).update({ 'steps': [
    { id: 'dwell', trigger: 'dwell', dwellSeconds: 60, zone: { kind: 'circle', lat: p.lat, lng: p.lng, radius: 30 }, channels: { push: true, map: false, ar: false },
      title: 'Stay', message: 'Thanks for staying', code: { kind: 'shared', value: 'STAY10' }, frequency: { kind: 'hours', hours: 6 }, budget: 1 },
    { id: 'bye', trigger: 'exit', zone: { kind: 'circle', lat: p.lat, lng: p.lng, radius: 30 }, channels: { push: true, map: false, ar: false },
      title: 'Bye', message: 'See you', code: { kind: 'none' }, frequency: { kind: 'once' } },
    { id: 'night', trigger: 'enter', zone: { kind: 'circle', lat: p.lat, lng: p.lng, radius: 30 }, channels: { push: true, map: false, ar: false },
      schedule: { days: [], start: '00:00', end: '23:59', timezone: 'Europe/Istanbul' }, title: 'N', message: 'N', code: { kind: 'none' }, frequency: { kind: 'once' } },
  ] });
  const inside = fix(p.lat, p.lng);
  assert.equal((await p.step('dwell', inside, { dwellStartedAt: Date.now() - 30_000 })).reason, 'unconfirmed', 'only 30 s of a 60 s dwell');
  const stayed = await p.step('dwell', inside, { dwellStartedAt: Date.now() - 65_000 });
  assert.equal(stayed.notify, true); assert.equal(stayed.code, 'STAY10');
  const other = await newAnonymousUser();
  await adminDb.collection('user_data_preferences').doc(other.luid).set({ owner_luid: other.luid, promotions: true, notifications: true, arrivals: true, departures: true });
  assert.equal((await other.call('recordCampaignStep', { campaignId: p.id, stepId: 'dwell', location: inside, dwellStartedAt: Date.now() - 65_000 })).reason, 'budget');
  assert.equal((await p.step('bye', fix(p.lat + 35 * M, p.lng))).reason, 'not_outside', 'still within GPS uncertainty');
  assert.equal((await p.step('bye', fix(p.lat + 80 * M, p.lng))).notify, true);
  assert.equal((await p.step('night', inside, { confirmationStartedAt: Date.now() - 3_000 })).reason, 'outside_schedule');
  await adminDb.collection('user_data_preferences').doc(p.user.luid).update({ arrivals: false });
  assert.equal((await p.step('dwell', inside, { dwellStartedAt: Date.now() - 65_000 })).reason, 'disabled');
  await adminDb.collection('user_data_preferences').doc(p.user.luid).update({ arrivals: true });
  await adminDb.collection('campaigns').doc(p.id).update({ status: 'paused' });
  assert.equal((await p.step('dwell', inside, { dwellStartedAt: Date.now() - 65_000 })).reason, 'inactive');
  assert.deepEqual((await p.user.call('readCampaignZones', { location: p.home })).regions, []);
});

test('leaving is accepted only within the campaign area, and account deletion removes progress and codes', async () => {
  const p = await partyFixture();
  assert.equal((await p.step('s1', fix(p.lat + 7_000 * M, p.lng, 40))).reason, 'outside_area');
  await p.step('s1', p.home);
  const beer = await p.step('s2', fix(p.lat, p.lng + 20 * M), { confirmationStartedAt: Date.now() - 3_000 });
  assert.ok(beer.code);
  await p.user.call('deleteAccount');
  assert.equal((await adminDb.collection('campaign_progress').where('owner_luid', '==', p.user.luid).get()).empty, true);
  assert.equal((await adminDb.collection('campaign_codes').where('owner_luid', '==', p.user.luid).get()).empty, true);
});


test('global opt-out stops push-only journeys and wake regions, while mixed map/AR rewards never notify', async () => {
  const p = await partyFixture({ requires: undefined, withinMinutes: undefined });
  await adminDb.collection('user_data_preferences').doc(p.user.luid).update({ notifications: false });
  assert.deepEqual((await p.user.call('readCampaignZones', { location: p.home })).regions, []);
  assert.equal((await p.step('s1', p.home)).reason, 'disabled');
  assert.equal((await adminDb.collection('campaign_progress').doc(`${p.id}_${p.user.luid}`).get()).exists, false);
  const result = await p.step('s2', fix(p.lat, p.lng + 50 * M), { confirmationStartedAt: Date.now() - 3000 });
  assert.equal(result.notify, false); assert.match(result.code, /^BEER-/); assert.ok(result.activityId);
  const offer = (await p.user.call('readPublicContent', { mode: 'single', postId: p.id })).posts[0];
  assert.ok(offer.sponsorship.codes.includes(result.code));
});
