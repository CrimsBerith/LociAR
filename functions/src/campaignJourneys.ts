import { randomBytes } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { db, Timestamp, FieldValue, requireCaller, isUUID, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, logger } from './core';
import { requireActiveAccount } from './profileGuard';
import { campaignLive } from './campaigns';
import { distanceMeters, encodeGeohash } from './geo';
import { geohashesInBox, stableUuid, validCoordinates, type Fix } from './placeNoteRules';
import {
  fixInsideZone, fixOutsideZone, frequencyAllows, makeCode, requirementMet, scheduleAllows, zoneBounds, LEAVE_MARGIN_M, MAX_DWELL_SECONDS,
  type Progress, type Step,
} from './journeyRules';

/**
 * Zone campaigns (journeys): ordered steps that fire when an opted-in person leaves their usual
 * place, enters, stays in or leaves a zone. Phones learn nearby campaigns from a coarse location;
 * the server never stores where anyone lives. Every step is admitted here, in one transaction.
 */
const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 30 };
const DAY = 86_400_000;
const SEARCH_M = 10_000;

function parseFix(value: unknown): Fix {
  const f = value as Fix;
  if (!f || !validCoordinates(f.lat, f.lng) || typeof f.accuracy !== 'number' || !Number.isFinite(f.accuracy) || f.accuracy < 0
      || typeof f.measuredAt !== 'number' || !Number.isFinite(f.measuredAt)) throw new HttpsError('invalid-argument', 'A location fix is required');
  return f;
}

const progressRef = (campaign: string, luid: string) => db.collection('campaign_progress').doc(`${campaign}_${luid}`);
const statsRef = (campaign: string, step: string) => db.collection('campaign_step_stats').doc(`${campaign}_${step}`);
const steps = (c: FirebaseFirestore.DocumentData): Step[] => Array.isArray(c.steps) ? c.steps : [];
const progressOf = (doc: FirebaseFirestore.DocumentSnapshot): Progress => {
  const raw = doc.get('steps') ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]: [string, any]) => [k, { count: Number(v?.count ?? 0), lastAt: v?.last_at instanceof Timestamp ? v.last_at.toMillis() : 0 }]));
};
const consented = (pref: FirebaseFirestore.DocumentSnapshot, trigger: Step['trigger']) =>
  pref.get('promotions') === true && (trigger === 'leave_usual_place' ? pref.get('departures') === true : pref.get('arrivals') === true);

/** Active zone campaigns around a coarse fix, as wake regions; exhausted and locked steps are left out. */
export const readCampaignZones = onCall(options, async request => {
  const caller = requireCaller(request), now = Date.now(), f = parseFix(request.data?.location);
  if (f.accuracy > 1_000 || f.measuredAt < now - 5 * 60_000 || f.measuredAt > now + 10_000) throw new HttpsError('invalid-argument', 'A recent location is required');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [pref, flags] = await tx.getAll(db.collection('user_data_preferences').doc(caller.luid), db.collection('system').doc('flags'));
    if (flags.get('kill_switch') === true || pref.get('notifications') !== true || pref.get('promotions') !== true) return { regions: [] };
    const campaigns = await tx.get(db.collection('campaigns').where('audience', '==', 'zone').where('status', '==', 'active').limit(300));
    const live = campaigns.docs.filter(c => campaignLive(c.data(), now) && distanceMeters(f.lat, f.lng, c.get('lat'), c.get('lng')) <= Number(c.get('radius') ?? 0) + SEARCH_M);
    const progress = live.length ? await tx.getAll(...live.map(c => progressRef(c.id, caller.luid))) : [];
    const regions = [];
    for (const [i, c] of live.entries()) {
      const done = progressOf(progress[i]), timezone = String(c.get('timezone') ?? 'Europe/Istanbul');
      for (const step of steps(c.data())) {
        if (!consented(pref, step.trigger) || !frequencyAllows(step.frequency, done[step.id], now, timezone)) continue;
        // A follow-up step is offered once its earlier step happened and is still valid.
        if (step.requires && !requirementMet(step, done, now)) continue;
        const base = { id: stableUuid(`step:${c.id}:${step.id}`), campaignId: c.id, stepId: step.id, trigger: step.trigger, kind: 'campaign_step',
          transition: 'entry', expiresAt: Math.min(c.get('ends_at').toMillis(), now + DAY) };
        if (step.trigger === 'leave_usual_place') {
          // No zone: the phone watches its own usual place and checks it against this area locally.
          regions.push({ ...base, lat: c.get('lat'), lng: c.get('lng'), radius: 150, area: { lat: c.get('lat'), lng: c.get('lng'), radius: c.get('radius') } });
        } else if (step.zone) {
          const b = zoneBounds(step.zone);
          // Legacy oversized definitions must be corrected in admin, never advertised with clipped coverage.
          if (b.radius > 2_950) continue;
          regions.push({ ...base, lat: b.lat, lng: b.lng, radius: Math.max(150, Math.ceil(b.radius + 50)), zone: step.zone,
            dwellSeconds: step.dwellSeconds ?? null });
        }
      }
    }
    regions.sort((a, b) => distanceMeters(f.lat, f.lng, a.lat, a.lng) - distanceMeters(f.lat, f.lng, b.lat, b.lng));
    return { regions: regions.slice(0, 8) };
  });
});

/** Admits one step for the caller: consent, schedule, geometry, order, frequency, budget, code. */
export const recordCampaignStep = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data, now = Date.now(), f = parseFix(b?.location);
  if (!isUUID(b?.campaignId) || typeof b?.stepId !== 'string' || b.stepId.length > 40) throw new HttpsError('invalid-argument', 'Invalid step');
  // Each trigger applies its own freshness below; nothing older than two minutes is considered.
  if (now - f.measuredAt > 120_000 || f.measuredAt > now + 10_000) return { notify: false, reason: 'stale_fix' };
  const id = b.campaignId.toLowerCase();
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [pref, flags, campaign, progressDoc] = await tx.getAll(db.collection('user_data_preferences').doc(caller.luid), db.collection('system').doc('flags'),
      db.collection('campaigns').doc(id), progressRef(id, caller.luid));
    const c = campaign.data();
    if (flags.get('kill_switch') === true || !c || c.audience !== 'zone' || !campaignLive(c, now)) return { notify: false, reason: 'inactive' };
    const brand = await tx.get(db.collection('brands').doc(c.brand_id));
    if (brand.get('status') !== 'active') return { notify: false, reason: 'inactive' };
    const step = steps(c).find(s => s.id === b.stepId);
    if (!step) return { notify: false, reason: 'unknown_step' };
    if (!consented(pref, step.trigger) || (step.channels.push && !step.channels.map && !step.channels.ar
      && pref.get('notifications') !== true)) return { notify: false, reason: 'disabled' };
    const timezone = String(c.timezone ?? 'Europe/Istanbul');
    if (!scheduleAllows(step.schedule, now)) return { notify: false, reason: 'outside_schedule' };
    // Geometry and confirmation for each trigger.
    const fresh = now - f.measuredAt <= 10_000 && f.measuredAt <= now + 5_000;
    if (step.trigger === 'leave_usual_place') {
      if (now - f.measuredAt > 120_000 || f.accuracy > 1_000 || distanceMeters(f.lat, f.lng, c.lat, c.lng) > Number(c.radius) + LEAVE_MARGIN_M) return { notify: false, reason: 'outside_area' };
    } else if (!step.zone) return { notify: false, reason: 'unknown_step' };
    else if (step.trigger === 'exit') {
      if (now - f.measuredAt > 60_000 || !fixOutsideZone(f, step.zone)) return { notify: false, reason: 'not_outside' };
    } else {
      if (!fresh || !fixInsideZone(f, step.zone)) return { notify: false, reason: 'not_inside' };
      const startedAt = step.trigger === 'dwell' ? b?.dwellStartedAt : b?.confirmationStartedAt;
      const needed = step.trigger === 'dwell' ? Math.min(MAX_DWELL_SECONDS, step.dwellSeconds ?? 60) * 1000 : 2_000;
      if (typeof startedAt !== 'number' || startedAt > f.measuredAt - needed || startedAt < f.measuredAt - needed - 30 * 60_000) return { notify: false, reason: 'unconfirmed' };
    }
    const progress = progressOf(progressDoc);
    if (!requirementMet(step, progress, now)) return { notify: false, reason: 'requires_previous_step' };
    if (!frequencyAllows(step.frequency, progress[step.id], now, timezone)) return { notify: false, reason: 'frequency' };
    const stats = await tx.get(statsRef(id, step.id));
    if (Number.isInteger(step.budget) && Number(stats.get('sent') ?? 0) >= step.budget!) return { notify: false, reason: 'budget' };
    let code: string | null = null, codeRef: FirebaseFirestore.DocumentReference | null = null;
    if (step.code?.kind === 'shared') code = String(step.code.value ?? '');
    if (step.code?.kind === 'unique') {
      for (let attempt = 0; attempt < 3 && !codeRef; attempt++) {
        const candidate = makeCode(step.code.prefix, n => randomBytes(n)), ref = db.collection('campaign_codes').doc(candidate);
        if (!(await tx.get(ref)).exists) { code = candidate; codeRef = ref; }
      }
      if (!codeRef) throw new HttpsError('aborted', 'Could not issue a code; retry');
    }
    const target = db.collection('campaign_targets').doc(`${id}_${caller.luid}`);
    const targetDoc = (step.channels.map || step.channels.ar) ? await tx.get(target) : null;
    // Writes.
    const count = (progress[step.id]?.count ?? 0) + 1;
    tx.set(progressDoc.ref, { owner_luid: caller.luid, campaign_id: id, steps: { [step.id]: { count, last_at: Timestamp.fromMillis(now) } },
      expires_at: Timestamp.fromMillis(c.ends_at.toMillis() + 30 * DAY) }, { merge: true });
    tx.set(stats.ref, { campaign_id: id, step_id: step.id, sent: FieldValue.increment(1), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    if (codeRef) tx.create(codeRef, { campaign_id: id, step_id: step.id, owner_luid: caller.luid, code, issued_at: FieldValue.serverTimestamp(), redeemed_at: null,
      expires_at: Timestamp.fromMillis(c.ends_at.toMillis() + 30 * DAY) });
    // Map/AR channels expose the private offer card; it carries the person's codes.
    if (targetDoc) tx.set(target, { campaign_id: id, owner_luid: caller.luid, state: 'assigned', notification_mode: 'zone',
      ...(code ? { codes: { ...(targetDoc.get('codes') ?? {}), [step.id]: code } } : {}), assigned_by: 'system:zone', created_at: targetDoc.exists ? targetDoc.get('created_at') : FieldValue.serverTimestamp(),
      expires_at: c.ends_at }, { merge: true });
    const activityId = `campaign_${id}_${step.id}_${caller.luid}_${count}`;
    const body = code ? `${step.message}\n${code}` : step.message;
    tx.create(db.collection('activity_events').doc(activityId), { kind: 'promotion', anonymous: true, actor_id: null, recipient_id: caller.luid,
      post_id: targetDoc ? id : null, body, read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * DAY) });
    return { notify: step.channels.push && pref.get('notifications') === true, title: step.title, body, code, postId: targetDoc ? id : null, activityId, recipientId: caller.luid, stepId: step.id };
  });
});

/** Geohash-4 topics (~39 x 20 km) covering a circle; phones subscribe to the one they are in. */
export function areaTopics(lat: number, lng: number, radius: number): string[] {
  const m = 1 / 111_320, dLng = radius * m / Math.max(0.01, Math.cos(lat * Math.PI / 180));
  return (geohashesInBox({ minLat: lat - radius * m, maxLat: lat + radius * m, minLng: lng - dLng, maxLng: lng + dLng }, 4, 16)
    ?? [encodeGeohash(lat, lng, 4)]).map(h => `area_${h}`);
}

/** Silent push: phones in the area refresh their monitored regions without the app being opened. */
export async function refreshArea(lat: number, lng: number, radius: number) {
  // The emulator has no FCM backend; phones refresh on their own schedule there.
  if (process.env.FUNCTIONS_EMULATOR === 'true') return;
  const messaging = getMessaging();
  for (const topic of areaTopics(lat, lng, radius)) {
    try {
      await messaging.send({ topic, data: { type: 'region_refresh' },
        apns: { headers: { 'apns-push-type': 'background', 'apns-priority': '5' }, payload: { aps: { contentAvailable: true } } } });
    } catch (error) { logger.warn('region refresh push failed', { topic, error: String(error) }); }
  }
}

export const onCampaignZoneChanged = onDocumentWritten({ document: 'campaigns/{id}', maxInstances: 2 }, async event => {
  const after = event.data?.after.data(), before = event.data?.before.data();
  if (after?.audience !== 'zone' || after.status !== 'active') return;
  if (before?.status === 'active' && JSON.stringify(before.steps) === JSON.stringify(after.steps)) return;
  await refreshArea(after.lat, after.lng, Number(after.radius ?? 1_000) + SEARCH_M / 2);
});
