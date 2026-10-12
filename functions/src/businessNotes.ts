import { createHash } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, isUUID, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { createPostHandler, type BusinessNoteMetadata } from './posts';
import { requireActiveAccount, profileBlock, accountDeletionRef } from './profileGuard';
import { isBlocked } from './anonymousAccess';
import { anyBlocked } from './moderation';
import { distanceMeters } from './geo';
import { pushQuotaDecision, pushQuotaId } from './pushPolicy';
import { businessNoteCurrent } from './businessRegistry';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 60 };
const DAY = 86_400_000;
function coordinates(lat: unknown, lng: unknown): boolean { return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180; }
function plain(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value)
      || anyBlocked([value]) || /[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,63}(?:\b|$)/iu.test(value)) throw new HttpsError('invalid-argument', 'Only moderated text without links is allowed');
  return value.trim();
}
function business(name: string, lat: number, lng: number): BusinessNoteMetadata {
  // A map selection is not a verified merchant identity. Stable grouping never includes author identity.
  const h = createHash('sha256').update(`${name.normalize('NFKC').toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`).digest('hex');
  return { id: `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`, name, lat, lng, radius: 2.5, revision: 1 };
}

export const createPlaceNote = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data;
  if (b?.userId !== caller.luid || !isUUID(b?.clientMutationId) || !coordinates(b?.lat, b?.lng)) throw new HttpsError('invalid-argument', 'Invalid map selection');
  let place = business(plain(b.name, 120), b.lat, b.lng);
  const saved = await db.collection('business_places').doc(place.id).get();
  if (saved.exists) {
    if (saved.get('status') !== 'active') throw new HttpsError('failed-precondition', 'Business is closed or unavailable');
    place = { id: saved.id, name: saved.get('name'), lat: saved.get('lat'), lng: saved.get('lng'), radius: (saved.get('notify_diameter_m') ?? 5) / 2, revision: saved.get('revision') };
  }
  const text = plain(b.text, 220);
  const data = { userId: caller.luid, clientMutationId: b.clientMutationId, caption: text, ageRating: 'all' as const, visibility: 'public' as const,
    pose: { latitude: place.lat, longitude: place.lng, heading: 0, anchor: { coordinateSpace: 'camera_free_space' as const,
      provider: 'native_ios_map', x: 0, y: 0, z: -2, yaw: 0, pitch: 0, roll: 0, capturedAt: new Date().toISOString() } },
    refImageUri: 'native-ar-reference://none', editData: { version: 1, layers: [{ id: b.clientMutationId, type: 'text', text }] } };
  // Same admission, invite, protected-zone, anonymous, rate/density and moderation gates as AR posts.
  return createPostHandler({ ...request, data }, place);
});

function fixOf(b: any, now: number) {
  const f = b?.location;
  if (!f || !coordinates(f.lat, f.lng) || !Number.isFinite(f.accuracy) || f.accuracy < 0 || f.accuracy > 200
      || !Number.isFinite(f.measuredAt) || f.measuredAt < now - 60_000 || f.measuredAt > now + 10_000) throw new HttpsError('invalid-argument', 'A recent, accurate fix is required');
  return f;
}
async function readable(tx: FirebaseFirestore.Transaction, p: FirebaseFirestore.DocumentSnapshot, luid: string, now: number) {
  const data = p.data();
  if (!data || data.note_kind !== 'business' || data.status !== 'active' || data.visibility !== 'public' || data.deleted_at || data.age_rating === '18_plus'
      || data.creator_id === luid || !(data.created_at instanceof Timestamp) || now - data.created_at.toMillis() > 30 * DAY) return false;
  if (!await businessNoteCurrent(tx, data)) return false;
  const [author, deletion] = await tx.getAll(db.collection('profiles').doc(data.creator_id), accountDeletionRef(data.creator_id));
  if (profileBlock(author.data()) || deletion.exists || await isBlocked(luid, data.creator_id, tx)) return false;
  const reports = await tx.get(db.collection('moderation_flags').where('user_id', '==', luid).where('post_id', '==', p.id).limit(1));
  return reports.empty;
}

export const readBusinessNoteRegions = onCall(options, async request => {
  const caller = requireCaller(request), now = Date.now(), f = fixOf(request.data, now);
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [pref, flags] = await tx.getAll(db.collection('user_data_preferences').doc(caller.luid), db.collection('system').doc('flags'));
    if (pref.get('place_notes') !== true || flags.get('kill_switch') === true) return { regions: [] };
    const delta = 3000 / 111_000;
    const page = await tx.get(db.collection('posts').where('note_kind', '==', 'business').where('status', '==', 'active').where('visibility', '==', 'public')
      .where('lat', '>=', Math.max(-90, f.lat - delta)).where('lat', '<=', Math.min(90, f.lat + delta)).orderBy('lat').limit(500));
    if (page.size === 500) throw new HttpsError('resource-exhausted', 'Business-note area is too dense');
    const candidates = page.docs.filter(d => coordinates(d.get('business_note')?.lat, d.get('business_note')?.lng)
      && distanceMeters(f.lat, f.lng, d.get('business_note').lat, d.get('business_note').lng) <= 3000)
      .sort((a, b) => distanceMeters(f.lat, f.lng, a.get('lat'), a.get('lng')) - distanceMeters(f.lat, f.lng, b.get('lat'), b.get('lng')));
    const seen = new Set<string>(), regions = [];
    // Bounded identity/report checks; another nearby note can be picked on the next refresh.
    for (const p of candidates.slice(0, 60)) {
      const place = p.get('business_note');
      if (!isUUID(place?.id) || seen.has(place.id) || !await readable(tx, p, caller.luid, now)) continue;
      const venue = await tx.get(db.collection('business_places').doc(place.id));
      if ((await tx.get(db.collection('place_note_notification_receipts').doc(`day_${caller.luid}_${place.id}_${new Date(now).toISOString().slice(0, 10)}`))).exists) { seen.add(place.id); continue; }
      seen.add(place.id); regions.push({ id: place.id, lat: venue.get('lat'), lng: venue.get('lng'), radius: 150,
        triggerRadius: (venue.get('notify_diameter_m') ?? 5) / 2, expiresAt: now + DAY, transition: 'entry', kind: 'place_note' });
      if (regions.length === 20) break;
    }
    return { regions };
  });
});

/** Body text is sent only after opt-in, current moderation and block/report checks. */
export const recordBusinessNoteVisit = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data, now = Date.now(), f = fixOf(b, now);
  if (!isUUID(b?.businessId)) throw new HttpsError('invalid-argument', 'Invalid business');
  const businessId = b.businessId.toLowerCase(), dayId = `day_${caller.luid}_${businessId}_${new Date(now).toISOString().slice(0, 10)}`;
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [pref, flags, day, quota] = await tx.getAll(db.collection('user_data_preferences').doc(caller.luid), db.collection('system').doc('flags'),
      db.collection('place_note_notification_receipts').doc(dayId), db.collection('place_note_push_quota').doc(pushQuotaId(caller.luid, now)));
    if (pref.get('place_notes') !== true || flags.get('kill_switch') === true || day.exists) return { notify: false };
    if (pref.get('notifications') === true && (!Number.isFinite(b.confirmationStartedAt) || b.confirmationStartedAt > f.measuredAt - 2000 || b.confirmationStartedAt < now - 30_000)) return { notify: false };
    const notes = await tx.get(db.collection('posts').where('business_id', '==', businessId).where('status', '==', 'active').where('visibility', '==', 'public').orderBy('created_at', 'desc').limit(30));
    for (const p of notes.docs) {
      const place = p.get('business_note');
      if (!place || !coordinates(place.lat, place.lng)
          || !await readable(tx, p, caller.luid, now)) continue;
      const venue = await tx.get(db.collection('business_places').doc(businessId)), radius = (venue.get('notify_diameter_m') ?? 5) / 2;
      if (!Number.isFinite(radius) || radius < 1 || radius > 2.5 || now - f.measuredAt > 10_000 || f.measuredAt > now + 5000
          || distanceMeters(f.lat, f.lng, venue.get('lat'), venue.get('lng')) + f.accuracy > radius) continue;
      const receipt = await tx.get(db.collection('place_note_notification_receipts').doc(`post_${caller.luid}_${p.id}`));
      if (receipt.exists) continue;
      const activityId = `place_note_${caller.luid}_${p.id}`, decision = pushQuotaDecision(quota.data(), activityId, 3);
      if (!decision.allow) return { notify: false };
      tx.create(day.ref, { owner_luid: caller.luid, expires_at: Timestamp.fromMillis(now + 2 * DAY) });
      tx.create(receipt.ref, { owner_luid: caller.luid, post_id: p.id, expires_at: Timestamp.fromMillis(now + 31 * DAY) });
      tx.set(quota.ref, { ...decision.next, owner_luid: caller.luid, expires_at: Timestamp.fromMillis(now + 2 * DAY) });
      tx.set(db.collection('activity_events').doc(activityId), { kind: 'place_note', anonymous: true, actor_id: null, recipient_id: caller.luid,
        post_id: p.id, body: p.get('caption'), read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * DAY) });
      return { notify: true, title: place.name, body: p.get('caption'), postId: p.id, activityId, recipientId: caller.luid };
    }
    return { notify: false };
  });
});
