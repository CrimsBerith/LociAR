import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { parseSteps, saveCampaignSteps, redeemCode, journeyFunnel } = await import('../../lib/campaign-journeys.ts');
const db = adminDb(), reason = 'Zone campaign regression check';
after(() => Promise.all(getApps().map(deleteApp)));

const party = [
  { id: 's1', trigger: 'leave_usual_place', title: 'Moda Party', message: 'Party in Moda tonight, come!', channels: { push: true },
    schedule: { days: [5, 6], start: '18:00', end: '23:00' } },
  { id: 's2', trigger: 'enter', requires: 's1', withinMinutes: 360, title: 'Moda Party', message: 'Free beer with this code',
    zone: { kind: 'street', points: [{ lat: 40.98, lng: 29.03 }, { lat: 40.981, lng: 29.031 }], width: 20 },
    channels: { push: true, map: true, ar: true }, code: { kind: 'unique', prefix: 'beer' }, frequency: { kind: 'once' }, budget: 300 },
];

test('steps are validated: zones, order, schedule, codes, channels and limits', () => {
  const steps = parseSteps(party, 'Europe/Istanbul');
  assert.equal(steps[0].zone, undefined); assert.deepEqual(steps[0].schedule, { days: [5, 6], start: '18:00', end: '23:00', timezone: 'Europe/Istanbul' });
  assert.equal(steps[1].code.prefix, 'BEER'); assert.equal(steps[1].budget, 300); assert.equal(steps[0].frequency.kind, 'once');
  assert.throws(() => parseSteps([{ ...party[1], requires: 'missing' }], 'UTC'), /unknown earlier step/);
  assert.throws(() => parseSteps([{ ...party[1], requires: undefined, zone: { kind: 'circle', lat: 40, lng: 29, radius: 5 } }], 'UTC'), /radius must be 15/);
  assert.throws(() => parseSteps([{ ...party[1], requires: undefined, zone: { kind: 'street', points: [{ lat: 40, lng: 29 }], width: 20 } }], 'UTC'), /2–20 points/);
  assert.throws(() => parseSteps([{ ...party[0], channels: { push: false } }], 'UTC'), /at least one channel/);
  assert.throws(() => parseSteps([{ ...party[0], message: 'See https://example.com' }], 'UTC'), /without links/);
  assert.throws(() => parseSteps(Array.from({ length: 6 }, (_, i) => ({ ...party[0], id: `x${i}` })), 'UTC'), /1–5 steps/);
});
test('journeys reject cyclic/forward dependencies and street definitions outside their wake coverage', () => {
  const enter = id => ({ ...party[1], id, requires: undefined });
  assert.throws(() => parseSteps([{ ...enter('a'), requires: 'b' }, { ...enter('b'), requires: 'a' }], 'UTC'), /unknown earlier step/);
  assert.throws(() => parseSteps([{ ...enter('a'), requires: 'b' }, enter('b')], 'UTC'), /unknown earlier step/);
  assert.equal(parseSteps([enter('a'), { ...enter('b'), requires: 'a' }], 'UTC').length, 2);
  assert.throws(() => parseSteps([{ ...enter('street'), zone: { kind: 'street', width: 20,
    points: [{ lat: 41, lng: 29 }, { lat: 41.08, lng: 29 }] } }], 'UTC'), /3 km monitoring circle/);
});

test('saving steps turns a campaign into an audited zone campaign; codes redeem once and count in the funnel', async () => {
  const actor = 'journey-' + randomUUID(), id = randomUUID();
  await db.collection('admin_role_assignments').doc(actor).set({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await db.collection('campaigns').doc(id).set({ name: 'Moda Party', status: 'draft', lat: 40.98, lng: 29.03, radius: 5000 });
  const key = randomUUID();
  await saveCampaignSteps({ campaignId: id, timezone: 'Europe/Istanbul', steps: party }, actor, reason, key);
  const c = (await db.collection('campaigns').doc(id).get()).data();
  assert.equal(c.audience, 'zone'); assert.equal(c.steps.length, 2); assert.equal(c.timezone, 'Europe/Istanbul');
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('action'), 'campaign_steps');
  await assert.rejects(saveCampaignSteps({ campaignId: id, timezone: 'Mars/Olympus', steps: party }, actor, reason, randomUUID()), /time zone/);
  await db.collection('campaign_codes').doc('BEER-ABCDEF').set({ campaign_id: id, step_id: 's2', owner_luid: randomUUID(), code: 'BEER-ABCDEF', redeemed_at: null });
  await db.collection('campaign_step_stats').doc(`${id}_s2`).set({ sent: 4 });
  await redeemCode({ code: 'beer-abcdef' }, actor, reason, randomUUID());
  await assert.rejects(redeemCode({ code: 'BEER-ABCDEF' }, actor, reason, randomUUID()), /already_redeemed/);
  await assert.rejects(redeemCode({ code: 'NOPE-123456' }, actor, reason, randomUUID()), /code_not_found/);
  const funnel = await journeyFunnel(id, c.steps);
  assert.deepEqual(funnel.map(f => [f.id, f.sent, f.redeemed]), [['s1', 0, 0], ['s2', 4, 1]]);
});
