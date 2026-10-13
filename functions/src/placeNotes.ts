import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { info } from 'firebase-functions/logger';
import { db, Timestamp, FieldValue, requireCaller, isUUID, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { createPostHandler, type LocationNoteMetadata } from './posts';
import { requireActiveAccount } from './profileGuard';
import { noteCandidate, readableNoteIds } from './placeNoteAccess';
import { anyBlocked, containsURL } from './moderation';
import { denseSpotsNear, spotReceiptRef, spotSettings } from './denseSpots';
import { distanceMeters } from './geo';
import { geoCandidates } from './geoQuery';
import {
  clampNotifyRadius, clusterNotes, compareByLikes, confirmationValid, defaultNotifyRadius, fixInsideNote, fixIsFresh,
  validCoordinates, WAKE_RADIUS_MIN_M, ENTRY_TOLERANCE_CAP_M, MAX_CREATE_ACCURACY_M, MAX_ENTRY_ACCURACY_M, MAX_NOTIFY_RADIUS_M, MAX_PIN_DRAG_M,
  REGION_SEARCH_RADIUS_M, SPOT_TRIGGER_RADIUS_M, stableUuid, type Fix, type FixSource, type RankedNote,
  deliveryRetryActive, DELIVERY_RETRY_WINDOW_MS,
} from './placeNoteRules';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 60 };
const DAY = 86_400_000;
const SOURCES: FixSource[] = ['geospatial', 'gps', 'manual'];
const MAX_REGIONS = 15;

function plain(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value)
      || anyBlocked([value]) || containsURL(value)) throw new HttpsError('invalid-argument', 'Only moderated text without links is allowed');
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

/** Complete coverage of the requested radius, including polar searches. */
async function approvedNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number) {
  return geoCandidates(tx, db.collection('posts').where('push_state', '==', 'approved'), lat, lng, radius);
}

function ranked(p: FirebaseFirestore.DocumentSnapshot): RankedNote {
  const created = p.get('created_at');
  return { id: p.id, lat: p.get('lat'), lng: p.get('lng'), radius: clampNotifyRadius(p.get('notify_radius_m')),
    likes: Number(p.get('likes_count') ?? 0), createdAtMs: created instanceof Timestamp ? created.toMillis() : 0 };
}

const receiptRef = (luid: string, postId: string) => db.collection('place_note_notification_receipts').doc(`post_${luid}_${postId}`);
const deliveryRef = (luid: string, id: string) => db.collection('place_note_notification_receipts').doc(`delivery_${luid}_${id}`);

// Rebuild from live content on every retry; never cache a caption across moderation or opt-out.
async function noteNotification(tx: FirebaseFirestore.Transaction, top: FirebaseFirestore.DocumentSnapshot, luid: string, now: number, total: number) {
  const activityId = `place_note_${luid}_${top.id}`, spotId = top.get('spot_id');
  const spot = typeof spotId === 'string' ? await tx.get(db.collection('note_spots').doc(spotId)) : null;
  const settings = spot?.exists ? await spotSettings(tx) : null;
  const unlock = spot?.exists ? await tx.get(db.collection('dense_spot_unlocks').doc(`${luid}_${spot.id}`)) : null;
  const locked = !!spot?.exists && Number(spot.get('count') ?? 0) >= settings!.denseThreshold
    && !(unlock?.exists && unlock.get('expires_at') instanceof Timestamp && unlock.get('expires_at').toMillis() > now);
  if (locked) return { notify: true, kind: 'dense_spot', total: Number(spot!.get('count')), spotLat: spot!.get('lat'), spotLng: spot!.get('lng'), activityId, recipientId: luid };
  return { notify: true, body: top.get('caption'), postId: top.id, activityId, recipientId: luid, likes: Number(top.get('likes_count') ?? 0), total };
}

function retryActive(receipt: FirebaseFirestore.DocumentSnapshot, now: number) {
  const created = receipt.get('created_at'), until = receipt.get('retry_until');
  return deliveryRetryActive(created instanceof Timestamp ? created.toMillis() : null, now, until instanceof Timestamp ? until.toMillis() : null);
}

/** Read lifetime receipts first, so seen/expired notes do not trigger author and report reads. */
async function unseenNotes(tx: FirebaseFirestore.Transaction, posts: FirebaseFirestore.DocumentSnapshot[], luid: string, now: number, includePending: boolean, limit: number) {
  const candidates = posts.filter(post => noteCandidate(post, luid));
  const result: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let start = 0; start < candidates.length && result.length < limit; start += 80) {
    const batch = candidates.slice(start, start + 80);
    const receipts = await tx.getAll(...batch.map(post => receiptRef(luid, post.id)));
    const unseen = batch.filter((_, index) => !receipts[index].exists
      || includePending && receipts[index].get('delivery_state') === 'pending' && retryActive(receipts[index], now));
    const readable = await readableNoteIds(tx, unseen, luid);
    result.push(...unseen.filter(post => readable.has(post.id)));
  }
  return result.slice(0, limit);
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
    const unseen = (await unseenNotes(tx, near, caller.luid, now, true, 80)).map(ranked);
    // Dense spots (30+ notes) wake the phone for a text-free "many notes here" alert, once per 30 days.
    const settings = await spotSettings(tx);
    const spots = [];
    const nearbySpots = await denseSpotsNear(tx, f.lat, f.lng, REGION_SEARCH_RADIUS_M, settings.denseThreshold);
    const spotReceipts = nearbySpots.length ? await tx.getAll(...nearbySpots.map(spot => spotReceiptRef(caller.luid, spot.id))) : [];
    for (const [index, spot] of nearbySpots.entries()) {
      const receipt = spotReceipts[index];
      if (receipt.exists && receipt.get('expires_at') instanceof Timestamp && receipt.get('expires_at').toMillis() > now) continue;
      const r = Math.min(MAX_NOTIFY_RADIUS_M, Math.max(SPOT_TRIGGER_RADIUS_M, Math.ceil(spot.radius + 10)));
      spots.push({ id: stableUuid(`dense:${spot.id}`), lat: spot.lat, lng: spot.lng, radius: WAKE_RADIUS_MIN_M,
        triggerRadius: r, notes: [{ lat: spot.lat, lng: spot.lng, r }], spot: spot.id });
      if (spots.length === 30) break;
    }
    const regions = [...clusterNotes(unseen), ...spots]
      .sort((a, b) => distanceMeters(f.lat, f.lng, a.lat, a.lng) - distanceMeters(f.lat, f.lng, b.lat, b.lng))
      .slice(0, MAX_REGIONS)
      .map(c => ({ ...c, expiresAt: now + DAY, transition: 'entry', kind: 'place_note' }));
    return { regions };
  });
});

/**
 * Called after a 10 s native entry confirmation. Picks the most-liked approved note the
 * visitor is inside and has never been notified about; each note reaches a person once.
 */
async function recordPlaceNoteVisitHandler(request: CallableRequest) {
  const caller = requireCaller(request), b = request.data, now = Date.now();
  const deliveryId = b?.deliveryId == null ? null : b.deliveryId;
  if (deliveryId !== null && !isUUID(deliveryId)) throw new HttpsError('invalid-argument', 'Invalid delivery ID');
  if (b?.action === 'acknowledge') {
    if (!deliveryId) throw new HttpsError('invalid-argument', 'A delivery ID is required');
    return db.runTransaction(async tx => {
      await requireActiveAccount(tx, caller.luid);
      if (!await notificationsAllowed(tx, caller.luid)) return { notify: false, reason: 'disabled' };
      const delivery = await tx.get(deliveryRef(caller.luid, deliveryId));
      if (!delivery.exists) throw new HttpsError('not-found', 'Delivery not found');
      const postId = delivery.get('post_id');
      const receipt = typeof postId === 'string' ? await tx.get(receiptRef(caller.luid, postId)) : null;
      tx.update(delivery.ref, { delivery_state: 'queued', local_queued_at: FieldValue.serverTimestamp() });
      if (receipt?.exists && receipt.get('delivery_id') === deliveryId) tx.update(receipt.ref, { delivery_state: 'queued', local_queued_at: FieldValue.serverTimestamp() });
      return { notify: false, reason: 'already_queued' };
    });
  }
  if (b?.action != null) throw new HttpsError('invalid-argument', 'Invalid delivery action');
  const f = parseFix(b?.location);
  if (!fixIsFresh(f, now)) return { notify: false, reason: 'stale_fix' };
  if (f.accuracy > MAX_ENTRY_ACCURACY_M) return { notify: false, reason: 'inaccurate_fix' };
  if (!confirmationValid(b?.confirmationStartedAt, f)) return { notify: false, reason: 'unconfirmed' };
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    if (!await notificationsAllowed(tx, caller.luid)) return { notify: false, reason: 'disabled' };
    if (deliveryId) {
      const previous = await tx.get(deliveryRef(caller.luid, deliveryId));
      if (previous.exists) {
        if (previous.get('delivery_state') === 'queued') return { notify: false, reason: 'already_queued' };
        if (!retryActive(previous, now)) return { notify: false, reason: 'delivery_expired' };
        const postId = previous.get('post_id');
        if (typeof postId === 'string') {
          const post = await tx.get(db.collection('posts').doc(postId));
          if (!(await readableNoteIds(tx, [post], caller.luid)).has(post.id) || !fixInsideNote(f, post.get('lat'), post.get('lng'), clampNotifyRadius(post.get('notify_radius_m')))) return { notify: false, reason: 'delivery_unavailable' };
          return { ...await noteNotification(tx, post, caller.luid, now, Number(previous.get('total') ?? 1)), deliveryId };
        }
        const spot = await tx.get(db.collection('note_spots').doc(previous.get('spot'))), settings = await spotSettings(tx);
        if (!spot.exists || Number(spot.get('count')) < settings.denseThreshold
          || distanceMeters(f.lat, f.lng, spot.get('lat'), spot.get('lng')) > Number(spot.get('radius') ?? 0) + 10 + Math.min(f.accuracy, ENTRY_TOLERANCE_CAP_M)) return { notify: false, reason: 'delivery_unavailable' };
        return { notify: true, kind: 'dense_spot', total: Number(spot.get('count')), spotLat: spot.get('lat'), spotLng: spot.get('lng'),
          activityId: previous.get('activity_id'), recipientId: caller.luid, deliveryId };
      }
    }
    const inside = (await approvedNear(tx, f.lat, f.lng, MAX_NOTIFY_RADIUS_M + ENTRY_TOLERANCE_CAP_M + 5))
      .filter(p => fixInsideNote(f, p.get('lat'), p.get('lng'), clampNotifyRadius(p.get('notify_radius_m'))))
      .sort((a, b) => compareByLikes(ranked(a), ranked(b)));
    const eligible = await unseenNotes(tx, inside, caller.luid, now, false, 40);
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
        const activityId = `dense_spot_${caller.luid}_${spot.id}${deliveryId ? `_${deliveryId}` : ''}`;
        if (deliveryId) tx.create(deliveryRef(caller.luid, deliveryId), { owner_luid: caller.luid, spot: spot.id, activity_id: activityId,
          delivery_state: 'pending', created_at: Timestamp.fromMillis(now), retry_until: Timestamp.fromMillis(now + DELIVERY_RETRY_WINDOW_MS) });
        return { notify: true, kind: 'dense_spot', total: spot.count, spotLat: spot.lat, spotLng: spot.lng, unlockRadius: settings.unlockRadius,
          activityId, recipientId: caller.luid, ...(deliveryId ? { deliveryId } : {}) };
      }
      return { notify: false, reason: 'nothing_new' };
    }
    const activityId = `place_note_${caller.luid}_${top.id}`;
    const notification = await noteNotification(tx, top, caller.luid, now, eligible.length);
    // No expiry: the same note is never sent to the same person again.
    tx.create(receiptRef(caller.luid, top.id), { owner_luid: caller.luid, post_id: top.id, created_at: Timestamp.fromMillis(now),
      ...(deliveryId ? { delivery_id: deliveryId, delivery_state: 'pending', retry_until: Timestamp.fromMillis(now + DELIVERY_RETRY_WINDOW_MS) } : {}) });
    if (deliveryId) tx.create(deliveryRef(caller.luid, deliveryId), { owner_luid: caller.luid, post_id: top.id, total: eligible.length,
      activity_id: activityId, delivery_state: 'pending', created_at: Timestamp.fromMillis(now), retry_until: Timestamp.fromMillis(now + DELIVERY_RETRY_WINDOW_MS) });
    tx.set(db.collection('activity_events').doc(activityId), { kind: 'place_note', anonymous: true, actor_id: null, recipient_id: caller.luid,
      post_id: top.id, body: top.get('caption'), read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * DAY) });
    return { ...notification, ...(deliveryId ? { deliveryId } : {}) };
  });
}

export const recordPlaceNoteVisit = onCall(options, async request => {
  const started = Date.now();
  try {
    const result = await recordPlaceNoteVisitHandler(request);
    const outcome = result as { notify: boolean; reason?: string };
    // Operational aggregates only: no recipient, author, request ID, text or coordinates.
    info('place_note_visit', { action: request.data?.action === 'acknowledge' ? 'acknowledge' : 'visit',
      notify: outcome.notify, reason: outcome.reason ?? 'reserved', elapsedMs: Date.now() - started });
    return result;
  } catch (error) {
    info('place_note_visit', { outcome: 'error', code: error instanceof HttpsError ? error.code : 'internal', elapsedMs: Date.now() - started });
    throw error;
  }
});
