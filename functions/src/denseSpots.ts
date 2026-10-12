import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { requireActiveAccount } from './profileGuard';
import { encodeGeohash, geohashCoverPrefixes } from './geo';
import {
  distanceToCell, fixIsFresh, fixUnlocksSpot, geohashBounds, geohashesInBox, validCoordinates, DEFAULT_DENSE_THRESHOLD,
  DEFAULT_UNLOCK_RADIUS_M, MAX_ENTRY_ACCURACY_M, MAX_UNLOCK_RADIUS_M, MIN_UNLOCK_RADIUS_M, SPOT_PRECISION, UNLOCK_TOLERANCE_CAP_M,
  UNLOCK_TTL_MS, type Fix,
} from './placeNoteRules';

/**
 * Dense spots: a ~38 x 19 m geohash cell holding at least `dense_threshold` public notes. Their
 * text opens only on site; the map shows the count everywhere. Counts come from note_density.
 */
export type SpotSettings = { denseThreshold: number; unlockRadius: number };

export async function spotSettings(tx?: FirebaseFirestore.Transaction): Promise<SpotSettings> {
  const ref = db.collection('system').doc('place_notes');
  const doc = tx ? await tx.get(ref) : await ref.get();
  const threshold = doc.get('dense_threshold'), radius = doc.get('unlock_radius_m');
  return {
    denseThreshold: Number.isInteger(threshold) && threshold >= 2 ? threshold : DEFAULT_DENSE_THRESHOLD,
    unlockRadius: typeof radius === 'number' && radius >= MIN_UNLOCK_RADIUS_M && radius <= MAX_UNLOCK_RADIUS_M ? radius : DEFAULT_UNLOCK_RADIUS_M,
  };
}

export const spotCellOf = (lat: number, lng: number) => encodeGeohash(lat, lng, SPOT_PRECISION);
const densityRef = (cell: string) => db.collection('note_density').doc(`${SPOT_PRECISION}_${cell}`);
const unlockRef = (luid: string, cell: string) => db.collection('dense_spot_unlocks').doc(`${luid}_${cell}`);
export const spotReceiptRef = (luid: string, cell: string) => db.collection('dense_spot_receipts').doc(`${luid}_${cell}`);

export type SpotLock = { cell: string; count: number; lat: number; lng: number; unlockRadius: number };

/** Posts the viewer may not read yet: inside a dense spot, not their own, no live unlock. */
export async function denseLocks(docs: FirebaseFirestore.DocumentSnapshot[], viewer: string): Promise<Map<string, SpotLock>> {
  const locks = new Map<string, SpotLock>();
  const candidates = docs.filter(d => d.get('creator_id') !== viewer && validCoordinates(d.get('lat'), d.get('lng')));
  if (!candidates.length) return locks;
  const cells = [...new Set(candidates.map(d => spotCellOf(d.get('lat'), d.get('lng'))))];
  const settings = await spotSettings();
  const counts = await db.getAll(...cells.map(densityRef));
  const dense = cells.filter((_, i) => Number(counts[i].get('count') ?? 0) >= settings.denseThreshold);
  if (!dense.length) return locks;
  const unlocks = await db.getAll(...dense.map(c => unlockRef(viewer, c)));
  const now = Date.now();
  const open = new Set(dense.filter((_, i) => unlocks[i].exists && unlocks[i].get('expires_at') instanceof Timestamp && unlocks[i].get('expires_at').toMillis() > now));
  const countOf = new Map(cells.map((c, i) => [c, Number(counts[i].get('count') ?? 0)]));
  for (const d of candidates) {
    const cell = spotCellOf(d.get('lat'), d.get('lng'));
    if (!dense.includes(cell) || open.has(cell)) continue;
    const centre = geohashBounds(cell);
    locks.set(d.id, { cell, count: countOf.get(cell) ?? 0, lat: centre.lat, lng: centre.lng, unlockRadius: settings.unlockRadius });
  }
  return locks;
}

/** Dense spot cells with a centre within `radius` of the point, most crowded first. */
export async function denseSpotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number, threshold: number) {
  const prefixes = geohashCoverPrefixes(lat, lng, radius);
  if (!prefixes.length) return [];
  const pages = await Promise.all(prefixes.map(prefix => tx.get(db.collection('note_density').where('precision', '==', SPOT_PRECISION)
    .orderBy('cell').startAt(prefix).endAt(prefix + '').limit(500))));
  return pages.flatMap(p => p.docs)
    .filter(d => Number(d.get('count') ?? 0) >= threshold && typeof d.get('cell') === 'string' && distanceToCell(lat, lng, d.get('cell')) <= radius)
    .map(d => ({ cell: String(d.get('cell')), count: Number(d.get('count')), lat: Number(d.get('lat')), lng: Number(d.get('lng')) }))
    .sort((a, b) => b.count - a.count);
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
    const reach = settings.unlockRadius + UNLOCK_TOLERANCE_CAP_M;
    const metre = 1 / 111_320, dLng = reach * metre / Math.max(0.01, Math.cos(f.lat * Math.PI / 180));
    const cells = geohashesInBox({ minLat: f.lat - reach * metre, maxLat: f.lat + reach * metre, minLng: f.lng - dLng, maxLng: f.lng + dLng }, SPOT_PRECISION, 60) ?? [];
    if (!cells.length) return { unlocked: [], reason: 'no_dense_spot' };
    const counts = await tx.getAll(...cells.map(densityRef));
    const dense = cells.filter((c, i) => Number(counts[i].get('count') ?? 0) >= settings.denseThreshold && fixUnlocksSpot(f, c, settings.unlockRadius));
    for (const cell of dense) tx.set(unlockRef(caller.luid, cell), { owner_luid: caller.luid, cell, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + UNLOCK_TTL_MS) });
    return { unlocked: dense, reason: dense.length ? null : 'too_far', unlockRadius: settings.unlockRadius };
  });
});
