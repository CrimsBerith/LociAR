import { FieldPath } from 'firebase-admin/firestore';
import { db, HttpsError } from './core';
import { distanceMeters } from './geo';

export type ProtectedZone = { name: string; category: string; lat: number; lng: number; radius_meters: number };
const PAGE_SIZE = 250;

export function validatedProtectedZone(value: FirebaseFirestore.DocumentData): ProtectedZone | null {
  const { lat, lng, radius_meters: radius } = value;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90
    || typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180
    || typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) return null;
  return {
    name: typeof value.name === 'string' && value.name.trim() ? value.name : 'Protected zone',
    category: typeof value.category === 'string' ? value.category : '',
    lat, lng, radius_meters: radius,
  };
}

/** Bumped in the same transaction as every admin zone change (admin/lib/ops.ts). */
export const ZONES_META_PATH = ['system', 'protected_zones_meta'] as const;
let zoneCache: { version: number; zones: ProtectedZone[] } | null = null;

async function readActiveZones(tx: FirebaseFirestore.Transaction): Promise<ProtectedZone[]> {
  const query = db.collection('protected_zones').where('active', '==', true).orderBy(FieldPath.documentId());
  const zones: ProtectedZone[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    const page: FirebaseFirestore.QuerySnapshot = await tx.get((cursor ? query.startAfter(cursor) : query).limit(PAGE_SIZE));
    for (const doc of page.docs) {
      const zone = validatedProtectedZone(doc.data());
      if (!zone) throw new HttpsError('failed-precondition', 'An active protected zone has invalid geometry');
      zones.push(zone);
    }
    if (page.size < PAGE_SIZE) return zones;
    cursor = page.docs[page.docs.length - 1];
  }
}

/**
 * Every admission reads the zone version document in its transaction. The zone list is reused only
 * while that version is unchanged: an admin change bumps it in the same transaction, so a concurrent
 * admission conflicts and retries against the new list, and the next one reloads it. Without a
 * version document (see ensureZonesMeta) the list is read fresh each time. Invalid active geometry fails closed rather than silently dropping a
 * hard-block rule. The emulator never caches, so tests that write zones directly stay exact.
 */
export async function protectedZoneAt(lat: number, lng: number, tx: FirebaseFirestore.Transaction): Promise<ProtectedZone | null> {
  const metaRef = db.collection(ZONES_META_PATH[0]).doc(ZONES_META_PATH[1]);
  const meta = await tx.get(metaRef);
  const version = meta.get('version');
  const cacheable = typeof version === 'number' && process.env.FUNCTIONS_EMULATOR !== 'true';
  let zones: ProtectedZone[];
  if (cacheable && zoneCache?.version === version) zones = zoneCache.zones;
  else {
    zones = await readActiveZones(tx);
    if (cacheable) zoneCache = { version, zones };
  }
  let best: { zone: ProtectedZone; distance: number } | null = null;
  for (const zone of zones) {
    const distance = distanceMeters(lat, lng, zone.lat, zone.lng);
    if (distance <= zone.radius_meters && (!best || distance < best.distance)) best = { zone, distance };
  }
  return best?.zone ?? null;
}

let metaEnsured = false;
/**
 * Creates the version document once per instance, outside any transaction (a transaction may not write
 * before its later reads). An admin change that already created it wins: `create` never overwrites.
 */
export async function ensureZonesMeta(): Promise<void> {
  if (metaEnsured) return;
  try {
    await db.collection(ZONES_META_PATH[0]).doc(ZONES_META_PATH[1]).create({ version: 1 });
  } catch (error) {
    if ((error as { code?: unknown }).code !== 6) throw error; // 6 = ALREADY_EXISTS
  }
  metaEnsured = true;
}

export const _test = { resetZoneCache: () => { zoneCache = null; metaEnsured = false; } };
