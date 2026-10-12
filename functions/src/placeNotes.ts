import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, isUUID, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { createPostHandler, type LocationNoteMetadata } from './posts';
import { requireActiveAccount, profileBlock, accountDeletionRef } from './profileGuard';
import { isBlocked } from './anonymousAccess';
import { anyBlocked } from './moderation';
import { denseSpotsNear, spotReceiptRef, spotSettings } from './denseSpots';
import { isPublicActive } from './counters';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import {
  clampNotifyRadius, clusterNotes, compareByLikes, confirmationValid, defaultNotifyRadius, fixInsideNote, fixIsFresh,
  validCoordinates, WAKE_RADIUS_MIN_M, ENTRY_TOLERANCE_CAP_M, MAX_CREATE_ACCURACY_M, MAX_ENTRY_ACCURACY_M, MAX_NOTIFY_RADIUS_M, MAX_PIN_DRAG_M,
  REGION_SEARCH_RADIUS_M, SPOT_TRIGGER_RADIUS_M, stableUuid, type Fix, type FixSource, type RankedNote,
} from './placeNoteRules';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 60 };
const DAY = 86_400_000;
const SOURCES: FixSource[] = ['geospatial', 'gps', 'manual'];
const MAX_REGIONS = 15;
const PAGE = 400;

function plain(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value)
      || anyBlocked([value]) || /[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,63}(?:\b|$)/iu.test(value)) throw new HttpsError('invalid-argument', 'Only moderated text without links is allowed');
  return value.trim();
}

/**
 * A location note is written where the author stands. GPS and Geospatial pins must be the
 * measured position; a pin moved by hand is `manual`, at most 50 m from the measurement.
 */
export const createPlaceNote = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data;
  if (b?.userId !== caller.luid || !isUUID(b?.clientMutationId) || !validCoordinates(b?.lat, b?.lng)) throw new HttpsError('invalid-argument', 'Invalid location');
  const source = b.source as FixSource, accuracy = b.accuracy;
  if (!SOURCES.includes(source) || typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) throw new HttpsError('invalid-argument', 'Invalid location source');
  if (accuracy > MAX_CREATE_ACCURACY_M) throw new HttpsError('failed-precondition', 'Location is too uncertain', { reason: 'location_inaccurate' });
  if (source !== 'manual' && accuracy > 15) throw new HttpsError('invalid-argument', 'Confirm an uncertain location by placing the pin');
  let drag = 0;
  if (source === 'manual') {
    if (!validCoordinates(b.measuredLat, b.measuredLng)) throw new HttpsError('invalid-argument', 'Measured position is required');
    drag = distanceMeters(b.measuredLat, b.measuredLng, b.lat, b.lng);
    if (drag > MAX_PIN_DRAG_M) throw new HttpsError('invalid-argument', 'The pin is too far from your position');
  }
  const note: LocationNoteMetadata = { source, accuracy_m: Math.round(accuracy * 10) / 10, pin_drag_m: Math.round(drag * 10) / 10, notify_radius_m: defaultNotifyRadius(source, accuracy) };
  const text = plain(b.text, 220);
  const data = { userId: caller.luid, clientMutationId: b.clientMutationId, caption: text, ageRating: 'all' as const, visibility: 'public' as const,
    pose: { latitude: b.lat, longitude: b.lng, heading: 0, anchor: { coordinateSpace: 'camera_free_space' as const,
      provider: 'native_ios_map', x: 0, y: 0, z: -2, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString() } },
    refImageUri: 'native-ar-reference://none', editData: { version: 1, layers: [{ id: b.clientMutationId, type: 'text', text }] } };
  // Same admission, invite, protected-zone, anonymous, rate/density and moderation gates as AR posts.
  return createPostHandler({ ...request, data }, note);
});

function parseFix(value: unknown): Fix {
  const f = value as Fix;
  if (!f || !validCoordinates(f.lat, f.lng) || typeof f.accuracy !== 'number' || !Number.isFinite(f.accuracy) || f.accuracy < 0
      || typeof f.measuredAt !== 'number' || !Number.isFinite(f.measuredAt)) throw new HttpsError('invalid-argument', 'A location fix is required');
  return f;
}

/** Approved notes whose stored position lies within `radius`; narrows the search when an area is dense. */
async function approvedNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number) {
  for (const r of [radius, 1_000, 400]) {
    if (r > radius) continue;
    const prefixes = geohashCoverPrefixes(lat, lng, r);
    if (!prefixes.length) return [];
    const pages = await Promise.all(prefixes.map(prefix => tx.get(db.collection('posts').where('push_state', '==', 'approved')
      .orderBy('geohash').startAt(prefix).endAt(prefix + '\uf8ff').limit(PAGE))));
    if (pages.some(page => page.size === PAGE) && r > 400) continue;
    const unique = new Map(pages.flatMap(page => page.docs).map(d => [d.id, d]));
    return [...unique.values()].filter(d => validCoordinates(d.get('lat'), d.get('lng')) && distanceMeters(lat, lng, d.get('lat'), d.get('lng')) <= r);
  }
  return [];
}

function ranked(p: FirebaseFirestore.DocumentSnapshot): RankedNote {
  const created = p.get('created_at');
  return { id: p.id, lat: p.get('lat'), lng: p.get('lng'), radius: clampNotifyRadius(p.get('notify_radius_m')),
    likes: Number(p.get('likes_count') ?? 0), createdAtMs: created instanceof Timestamp ? created.toMillis() : 0 };
}

const receiptRef = (luid: string, postId: string) => db.collection('place_note_notification_receipts').doc(`post_${luid}_${postId}`);

/** Approved, live, not own, author visible, not blocked and not reported by the viewer. */
async function readable(tx: FirebaseFirestore.Transaction, p: FirebaseFirestore.DocumentSnapshot, luid: string) {
  const data = p.data();
  if (!data || !isPublicActive(data) || data.push_state !== 'approved' || data.creator_id === luid) return false;
  const [author, deletion] = await tx.getAll(db.collection('profiles').doc(data.creator_id), accountDeletionRef(data.creator_id));
  if (profileBlock(author.data()) || deletion.exists || await isBlocked(luid, data.creator_id, tx)) return false;
  const reports = await tx.get(db.collection('moderation_flags').where('user_id', '==', luid).where('post_id', '==', p.id).limit(1));
  return reports.empty;
}

async function notificationsAllowed(tx: FirebaseFirestore.Transaction, luid: string) {
  const [pref, flags] = await tx.getAll(db.collection('user_data_preferences').doc(luid), db.collection('system').doc('flags'));
  return pref.get('place_notes') === true && flags.get('kill_switch') !== true;
}

/**
 * Wake regions for the nearest clusters that still hold an approved note this user has not
 * been told about. Seen clusters do not consume one of the device's 20 monitored regions.
 */
export const readPlaceNoteRegions = onCall(options, async request => {
  const caller = requireCaller(request), now = Date.now(), f = parseFix(request.data?.location);
  // A coarse significant-change fix (cell/Wi-Fi) is enough for a 3 km region search.
  if (f.accuracy > 1_000 || f.measuredAt < now - 5 * 60_000 || f.measuredAt > now + 10_000) throw new HttpsError('invalid-argument', 'A recent location is required');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    if (!await notificationsAllowed(tx, caller.luid)) return { regions: [] };
    const near = (await approvedNear(tx, f.lat, f.lng, REGION_SEARCH_RADIUS_M))
      .sort((a, b) => distanceMeters(f.lat, f.lng, a.get('lat'), a.get('lng')) - distanceMeters(f.lat, f.lng, b.get('lat'), b.get('lng')));
    const unseen: RankedNote[] = [];
    // Identity and report checks are bounded; farther notes are picked up on a later refresh.
    for (const p of near.slice(0, 80)) {
      if (!await readable(tx, p, caller.luid)) continue;
      if ((await tx.get(receiptRef(caller.luid, p.id))).exists) continue;
      unseen.push(ranked(p));
    }
    // Dense spots (30+ notes) wake the phone for a text-free "many notes here" alert, once per 30 days.
    const settings = await spotSettings(tx);
    const spots = [];
    for (const spot of (await denseSpotsNear(tx, f.lat, f.lng, REGION_SEARCH_RADIUS_M, settings.denseThreshold)).slice(0, 30)) {
      const receipt = await tx.get(spotReceiptRef(caller.luid, spot.id));
      if (receipt.exists && receipt.get('expires_at') instanceof Timestamp && receipt.get('expires_at').toMillis() > now) continue;
      const r = Math.min(MAX_NOTIFY_RADIUS_M, Math.max(SPOT_TRIGGER_RADIUS_M, Math.ceil(spot.radius + 10)));
      spots.push({ id: stableUuid(`dense:${spot.id}`), lat: spot.lat, lng: spot.lng, radius: WAKE_RADIUS_MIN_M,
        triggerRadius: r, notes: [{ lat: spot.lat, lng: spot.lng, r }], spot: spot.id });
    }
    const regions = [...clusterNotes(unseen), ...spots]
      .sort((a, b) => distanceMeters(f.lat, f.lng, a.lat, a.lng) - distanceMeters(f.lat, f.lng, b.lat, b.lng))
      .slice(0, MAX_REGIONS)
      .map(c => ({ ...c, expiresAt: now + DAY, transition: 'entry', kind: 'place_note' }));
    return { regions };
  });
});

/**
 * Called after two agreeing fixes at least 5 s apart. Picks the most-liked approved note the
 * visitor is inside and has never been notified about; each note reaches a person once.
 */
export const recordPlaceNoteVisit = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data, now = Date.now(), f = parseFix(b?.location);
  if (!fixIsFresh(f, now)) return { notify: false, reason: 'stale_fix' };
  if (f.accuracy > MAX_ENTRY_ACCURACY_M) return { notify: false, reason: 'inaccurate_fix' };
  if (!confirmationValid(b?.confirmationStartedAt, f)) return { notify: false, reason: 'unconfirmed' };
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    if (!await notificationsAllowed(tx, caller.luid)) return { notify: false, reason: 'disabled' };
    const inside = (await approvedNear(tx, f.lat, f.lng, MAX_NOTIFY_RADIUS_M + ENTRY_TOLERANCE_CAP_M + 5))
      .filter(p => fixInsideNote(f, p.get('lat'), p.get('lng'), clampNotifyRadius(p.get('notify_radius_m'))))
      .sort((a, b) => compareByLikes(ranked(a), ranked(b)));
    const eligible: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const p of inside.slice(0, 40)) {
      if (!await readable(tx, p, caller.luid)) continue;
      if ((await tx.get(receiptRef(caller.luid, p.id))).exists) continue;
      eligible.push(p);
    }
    const top = eligible[0];
    if (!top) {
      // No approved note here: a dense spot still earns one text-free alert per 30 days.
      const settings = await spotSettings(tx);
      // Within 10 m of the spot circle, plus GPS tolerance.
      const spots = await denseSpotsNear(tx, f.lat, f.lng, 10 + Math.min(f.accuracy, ENTRY_TOLERANCE_CAP_M), settings.denseThreshold);
      for (const spot of spots) {
        const receipt = await tx.get(spotReceiptRef(caller.luid, spot.id));
        if (receipt.exists && receipt.get('expires_at') instanceof Timestamp && receipt.get('expires_at').toMillis() > now) continue;
        tx.set(receipt.ref, { owner_luid: caller.luid, spot: spot.id, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * DAY) });
        return { notify: true, kind: 'dense_spot', total: spot.count, spotLat: spot.lat, spotLng: spot.lng, unlockRadius: settings.unlockRadius,
          activityId: `dense_spot_${caller.luid}_${spot.id}`, recipientId: caller.luid };
      }
      return { notify: false, reason: 'nothing_new' };
    }
    const activityId = `place_note_${caller.luid}_${top.id}`;
    // A note inside a dense spot never travels as text: the alert only counts the notes there.
    const spotId = top.get('spot_id');
    const spot = typeof spotId === 'string' ? await tx.get(db.collection('note_spots').doc(spotId)) : null;
    const settings = spot?.exists ? await spotSettings(tx) : null;
    const unlock = spot?.exists ? await tx.get(db.collection('dense_spot_unlocks').doc(`${caller.luid}_${spot.id}`)) : null;
    const locked = !!spot?.exists && Number(spot.get('count') ?? 0) >= settings!.denseThreshold
      && !(unlock?.exists && unlock.get('expires_at') instanceof Timestamp && unlock.get('expires_at').toMillis() > now);
    // No expiry: the same note is never sent to the same person again.
    tx.create(receiptRef(caller.luid, top.id), { owner_luid: caller.luid, post_id: top.id, created_at: FieldValue.serverTimestamp() });
    tx.set(db.collection('activity_events').doc(activityId), { kind: 'place_note', anonymous: true, actor_id: null, recipient_id: caller.luid,
      post_id: top.id, body: top.get('caption'), read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * DAY) });
    if (locked) return { notify: true, kind: 'dense_spot', total: Number(spot!.get('count')), postId: top.id, activityId, recipientId: caller.luid };
    return { notify: true, body: top.get('caption'), postId: top.id, activityId, recipientId: caller.luid,
      likes: Number(top.get('likes_count') ?? 0), total: eligible.length };
  });
});
