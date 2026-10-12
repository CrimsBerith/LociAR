import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { requireActiveAccount } from './profileGuard';
import { isPublicActive } from './counters';
import { distanceMeters, encodeGeohash, geohashCoverPrefixes } from './geo';
import {
  distanceToSpot, fixIsFresh, fixUnlocksSpot, joinSpot, spotOf, validCoordinates, DEFAULT_DENSE_THRESHOLD, DEFAULT_UNLOCK_RADIUS_M,
  MAX_ENTRY_ACCURACY_M, MAX_SPOT_RADIUS_M, MAX_UNLOCK_RADIUS_M, MIN_SPOT_SIZE, MIN_UNLOCK_RADIUS_M, SPOT_JOIN_RADIUS_M,
  UNLOCK_TOLERANCE_CAP_M, UNLOCK_TTL_MS, type Fix, type Spot,
} from './placeNoteRules';

/**
 * Spots are server-only clusters of public posts (notes within 25 m of a running centroid,
 * at most 40 m wide). A spot holding at least `dense_threshold` posts is dense: its text opens
 * only on site. Membership lives on the post (`spot_id`), so the count follows the real notes
 * instead of a fixed grid cell.
 */
export type SpotSettings = { denseThreshold: number; unlockRadius: number };

export async function spotSettings(tx?: FirebaseFirestore.Transaction): Promise<SpotSettings> {
  const ref = db.collection('system').doc('place_notes');
  const doc = tx ? await tx.get(ref) : await ref.get();
  const threshold = doc.get('dense_threshold'), radius = doc.get('unlock_radius_m');
  return {
    denseThreshold: Number.isInteger(threshold) && threshold >= MIN_SPOT_SIZE ? threshold : DEFAULT_DENSE_THRESHOLD,
    unlockRadius: typeof radius === 'number' && radius >= MIN_UNLOCK_RADIUS_M && radius <= MAX_UNLOCK_RADIUS_M ? radius : DEFAULT_UNLOCK_RADIUS_M,
  };
}

const spots = () => db.collection('note_spots');
const unlockRef = (luid: string, spot: string) => db.collection('dense_spot_unlocks').doc(`${luid}_${spot}`);
export const spotReceiptRef = (luid: string, spot: string) => db.collection('dense_spot_receipts').doc(`${luid}_${spot}`);
type SpotDoc = Spot & { id: string; count: number };
const spotData = (d: FirebaseFirestore.DocumentSnapshot): SpotDoc => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), radius: d.get('radius'), count: Number(d.get('count') ?? 0) });

async function spotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number): Promise<SpotDoc[]> {
  const prefixes = geohashCoverPrefixes(lat, lng, radius + MAX_SPOT_RADIUS_M);
  const pages = await Promise.all(prefixes.map(p => tx.get(spots().orderBy('geohash').startAt(p).endAt(p + '\uf8ff').limit(300))));
  return pages.flatMap(p => p.docs).map(spotData).filter(s => validCoordinates(s.lat, s.lng) && distanceToSpot(lat, lng, s) <= radius);
}

/**
 * Keeps a post's spot membership in step with its live state: leaves its spot when it stops
 * being public or moves away, joins the nearest spot within 25 m, or seeds a new spot when at
 * least five unclustered public posts lie within 25 m.
 */
export async function syncSpotMembership(postId: string) {
  await db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId), post = await tx.get(ref), data = post.data();
    const counted = !!data && isPublicActive(data) && validCoordinates(data.lat, data.lng);
    const currentId = typeof data?.spot_id === 'string' ? data.spot_id : null;
    const current = currentId ? await tx.get(spots().doc(currentId)) : null;
    const stillInside = counted && current?.exists && distanceMeters(data!.lat, data!.lng, current.get('lat'), current.get('lng')) <= MAX_SPOT_RADIUS_M;
    if (stillInside) return;
    const nearby = counted ? await spotsNear(tx, data!.lat, data!.lng, SPOT_JOIN_RADIUS_M) : [];
    const pages = counted && !nearby.length ? await Promise.all(geohashCoverPrefixes(data!.lat, data!.lng, SPOT_JOIN_RADIUS_M)
      .map(p => tx.get(db.collection('posts').orderBy('geohash').startAt(p).endAt(p + '\uf8ff').limit(300)))) : [];
    // Reads are done; writes follow. The old spot loses the post unless it rejoins that same spot.
    const best = nearby.sort((a, b) => distanceMeters(data!.lat, data!.lng, a.lat, a.lng) - distanceMeters(data!.lat, data!.lng, b.lat, b.lng))[0];
    if (current?.exists && best?.id !== currentId) tx.update(current.ref, { count: FieldValue.increment(-1), updated_at: FieldValue.serverTimestamp() });
    if (!counted) { if (currentId) tx.update(ref, { spot_id: FieldValue.delete() }); return; }
    if (best && best.id === currentId) return;
    if (best) {
      const next = joinSpot(best, data!.lat, data!.lng);
      tx.update(spots().doc(best.id), { ...next, geohash: encodeGeohash(next.lat, next.lng, 9), updated_at: FieldValue.serverTimestamp() });
      tx.update(ref, { spot_id: best.id });
      return;
    }
    const members = [...new Map(pages.flatMap(p => p.docs).map(d => [d.id, d])).values()].filter(d => (d.id === postId || !d.get('spot_id')) && isPublicActive(d.data())
      && validCoordinates(d.get('lat'), d.get('lng')) && distanceMeters(data!.lat, data!.lng, d.get('lat'), d.get('lng')) <= SPOT_JOIN_RADIUS_M);
    if (!members.some(d => d.id === postId)) members.push(post as FirebaseFirestore.QueryDocumentSnapshot);
    if (members.length < MIN_SPOT_SIZE) { if (currentId) tx.update(ref, { spot_id: FieldValue.delete() }); return; }
    const spot = spotOf(members.map(d => ({ lat: d.get('lat'), lng: d.get('lng') }))), spotRef = spots().doc(postId);
    tx.set(spotRef, { ...spot, geohash: encodeGeohash(spot.lat, spot.lng, 9), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    for (const m of members.slice(0, 200)) tx.update(m.ref, { spot_id: spotRef.id });
  });
}

export type SpotLock = { spot: string; count: number; lat: number; lng: number; unlockRadius: number };

/** Posts the viewer may not read yet: in a dense spot, not their own, no live unlock. */
export async function denseLocks(docs: FirebaseFirestore.DocumentSnapshot[], viewer: string): Promise<Map<string, SpotLock>> {
  const locks = new Map<string, SpotLock>();
  const candidates = docs.filter(d => d.get('creator_id') !== viewer && typeof d.get('spot_id') === 'string');
  if (!candidates.length) return locks;
  const ids = [...new Set(candidates.map(d => String(d.get('spot_id'))))];
  const settings = await spotSettings();
  const found = await db.getAll(...ids.map(id => spots().doc(id)));
  const dense = found.filter(s => s.exists && Number(s.get('count') ?? 0) >= settings.denseThreshold).map(spotData);
  if (!dense.length) return locks;
  const unlocks = await db.getAll(...dense.map(s => unlockRef(viewer, s.id))), now = Date.now();
  const open = new Set(dense.filter((_, i) => unlocks[i].exists && unlocks[i].get('expires_at') instanceof Timestamp && unlocks[i].get('expires_at').toMillis() > now).map(s => s.id));
  const byId = new Map(dense.map(s => [s.id, s]));
  for (const d of candidates) {
    const s = byId.get(String(d.get('spot_id')));
    if (s && !open.has(s.id)) locks.set(d.id, { spot: s.id, count: s.count, lat: s.lat, lng: s.lng, unlockRadius: settings.unlockRadius });
  }
  return locks;
}

/** Dense spots whose circle lies within `radius` of the point, most crowded first. */
export async function denseSpotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number, threshold: number) {
  return (await spotsNear(tx, lat, lng, radius)).filter(s => s.count >= threshold).sort((a, b) => b.count - a.count);
}

/**
 * Opens the dense spots around a fresh fix for 30 minutes. Clients send the best fix they have:
 * AR Geospatial (1-5 m outdoors) when the camera is localized, otherwise GPS.
 */
export const unlockDenseSpot = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 30 }, async request => {
  const caller = requireCaller(request), f = request.data?.location as Fix, now = Date.now();
  if (!f || !validCoordinates(f.lat, f.lng) || typeof f.accuracy !== 'number' || typeof f.measuredAt !== 'number') throw new HttpsError('invalid-argument', 'A location fix is required');
  if (!fixIsFresh(f, now)) return { unlocked: [], reason: 'stale_fix' };
  if (f.accuracy > MAX_ENTRY_ACCURACY_M) return { unlocked: [], reason: 'inaccurate_fix' };
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const settings = await spotSettings(tx);
    const near = await denseSpotsNear(tx, f.lat, f.lng, settings.unlockRadius + UNLOCK_TOLERANCE_CAP_M, settings.denseThreshold);
    const opened = near.filter(s => fixUnlocksSpot(f, s, settings.unlockRadius)).map(s => s.id);
    for (const id of opened) tx.set(unlockRef(caller.luid, id), { owner_luid: caller.luid, spot: id, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + UNLOCK_TTL_MS) });
    return { unlocked: opened, reason: opened.length ? null : 'too_far', unlockRadius: settings.unlockRadius };
  });
});
