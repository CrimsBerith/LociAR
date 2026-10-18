import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { requireActiveAccount } from './profileGuard';
import { isPublicActive } from './counters';
import { distanceMeters, encodeGeohash } from './geo';
import { geoCandidates } from './geoQuery';
import {
  distanceToSpot, fixIsFresh, fixUnlocksSpot, joinSpot, spotOf, validCoordinates, DEFAULT_DENSE_THRESHOLD, DEFAULT_UNLOCK_RADIUS_M,
  MAX_ENTRY_ACCURACY_M, MAX_SPOT_RADIUS_M, MAX_UNLOCK_RADIUS_M, MIN_SPOT_SIZE, MIN_UNLOCK_RADIUS_M, SPOT_JOIN_RADIUS_M,
  UNLOCK_TOLERANCE_CAP_M, UNLOCK_TTL_MS, type Fix, type Spot,
} from './placeNoteRules';

/**
 * Spots are server-only clusters of public posts (notes within 25 m of a running centroid,
 * at most 40 m wide). A spot holding at least `dense_threshold` posts is dense: its text opens
 * only on site. A server-only membership record survives deletion until the count is settled.
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
const memberRef = (postId: string) => db.collection('note_spot_members').doc(postId);
const unlockRef = (luid: string, spot: string) => db.collection('dense_spot_unlocks').doc(`${luid}_${spot}`);
export const spotReceiptRef = (luid: string, spot: string) => db.collection('dense_spot_receipts').doc(`${luid}_${spot}`);
type SpotDoc = Spot & { id: string; count: number };
const spotData = (d: FirebaseFirestore.DocumentSnapshot): SpotDoc => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), radius: d.get('radius'), count: Number(d.get('count') ?? 0) });

async function spotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number): Promise<SpotDoc[]> {
  return (await geoCandidates(tx, spots(), lat, lng, radius + MAX_SPOT_RADIUS_M)).map(spotData)
    .filter(s => distanceToSpot(lat, lng, s) <= radius);
}

/**
 * Keeps a post's spot membership in step with its live state: leaves its spot when it stops
 * being public or moves away, joins the nearest spot within 25 m, or seeds a new spot when at
 * least five unclustered public posts lie within 25 m.
 */
export async function syncSpotMembership(postId: string) {
  await db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId);
    const [post, member] = await tx.getAll(ref, memberRef(postId)), data = post.data();
    const counted = !!data && isPublicActive(data) && validCoordinates(data.lat, data.lng);
    const currentId = existingSpotId(member, data);
    const current = currentId ? await tx.get(spots().doc(currentId)) : null;
    const stillInside = counted && current?.exists && distanceMeters(data!.lat, data!.lng, current.get('lat'), current.get('lng')) <= MAX_SPOT_RADIUS_M;
    if (stillInside) {
      restoreSpotMember(tx, member, postId, currentId!, data!.creator_id);
      return;
    }
    const nearby = counted ? await spotsNear(tx, data!.lat, data!.lng, SPOT_JOIN_RADIUS_M) : [];
    const candidates = counted && !nearby.length ? await geoCandidates(tx, db.collection('posts'), data!.lat, data!.lng, SPOT_JOIN_RADIUS_M) : [];
    // Reads are done; writes follow. The old spot loses the post unless it rejoins that same spot.
    nearby.sort((a, b) => distanceMeters(data!.lat, data!.lng, a.lat, a.lng) - distanceMeters(data!.lat, data!.lng, b.lat, b.lng));
    const best = nearby[0];
    if (current?.exists && best?.id !== currentId) tx.update(current.ref, { count: FieldValue.increment(-1), updated_at: FieldValue.serverTimestamp() });
    if (!counted) {
      clearSpotMembership(tx, post, member, Boolean(post.exists && data?.spot_id));
      return;
    }
    if (best && best.id === currentId) return;
    if (best) {
      const next = joinSpot(best, data!.lat, data!.lng);
      tx.update(spots().doc(best.id), { ...next, geohash: encodeGeohash(next.lat, next.lng, 9), updated_at: FieldValue.serverTimestamp() });
      tx.update(ref, { spot_id: best.id });
      tx.set(member.ref, { post_id: postId, spot_id: best.id, owner_luid: data!.creator_id });
      return;
    }
    seedSpot(tx, post, member, candidates, data!, currentId);
  });
}

function restoreSpotMember(tx: FirebaseFirestore.Transaction, member: FirebaseFirestore.DocumentSnapshot, postId: string, spotId: string, owner: string) {
  if (!member.exists) tx.set(member.ref, { post_id: postId, spot_id: spotId, owner_luid: owner });
}

function existingSpotId(member: FirebaseFirestore.DocumentSnapshot, data: FirebaseFirestore.DocumentData | undefined): string | null {
  const id = member.get('spot_id');
  if (typeof id === 'string') return id;
  return typeof data?.spot_id === 'string' ? data.spot_id : null;
}

function clearSpotMembership(tx: FirebaseFirestore.Transaction, post: FirebaseFirestore.DocumentSnapshot,
  member: FirebaseFirestore.DocumentSnapshot, clearPost: boolean) {
  if (clearPost) tx.update(post.ref, { spot_id: FieldValue.delete() });
  if (member.exists) tx.delete(member.ref);
}

function seedSpot(tx: FirebaseFirestore.Transaction, post: FirebaseFirestore.DocumentSnapshot,
  member: FirebaseFirestore.DocumentSnapshot, candidates: FirebaseFirestore.QueryDocumentSnapshot[], data: FirebaseFirestore.DocumentData, currentId: string | null) {
  const members = candidates.filter(d => (d.id === post.id || !d.get('spot_id')) && isPublicActive(d.data())
    && validCoordinates(d.get('lat'), d.get('lng')) && distanceMeters(data.lat, data.lng, d.get('lat'), d.get('lng')) <= SPOT_JOIN_RADIUS_M);
  if (!members.some(d => d.id === post.id)) members.push(post as FirebaseFirestore.QueryDocumentSnapshot);
  if (members.length < MIN_SPOT_SIZE) {
    if (currentId) tx.update(post.ref, { spot_id: FieldValue.delete() });
    if (member.exists) tx.delete(member.ref);
    return;
  }
  // Two writes per member, still below Firestore's 500-write transaction budget.
  const selected = members.slice(0, 200);
  const spot = spotOf(selected.map(d => ({ lat: d.get('lat'), lng: d.get('lng') }))), spotRef = spots().doc(post.id);
  tx.set(spotRef, { ...spot, geohash: encodeGeohash(spot.lat, spot.lng, 9), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
  for (const m of selected) {
    tx.update(m.ref, { spot_id: spotRef.id });
    tx.set(memberRef(m.id), { post_id: m.id, spot_id: spotRef.id, owner_luid: m.get('creator_id') });
  }
}

/** Idempotent legacy repair: derive the count from live source posts, never a historical delta. */
export async function repairSpotCount(spotId: string) {
  await db.runTransaction(async tx => {
    const spot = await tx.get(spots().doc(spotId));
    if (!spot.exists) return;
    const posts = await tx.get(db.collection('posts').where('spot_id', '==', spotId)
      .select('status', 'visibility', 'age_rating', 'deleted_at'));
    const count = posts.docs.filter(post => isPublicActive(post.data())).length;
    if (spot.get('count') !== count) tx.update(spot.ref, { count, updated_at: FieldValue.serverTimestamp() });
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
  return await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const settings = await spotSettings(tx);
    const near = await denseSpotsNear(tx, f.lat, f.lng, settings.unlockRadius + UNLOCK_TOLERANCE_CAP_M, settings.denseThreshold);
    const opened = near.filter(s => fixUnlocksSpot(f, s, settings.unlockRadius)).map(s => s.id);
    for (const id of opened) tx.set(unlockRef(caller.luid, id), { owner_luid: caller.luid, spot: id, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + UNLOCK_TTL_MS) });
    return { unlocked: opened, reason: opened.length ? null : 'too_far', unlockRadius: settings.unlockRadius };
  });
});
