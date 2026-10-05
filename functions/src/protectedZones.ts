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

/**
 * Fresh transactional read on every admission, with no cap or process cache: a newly activated
 * zone takes effect on the next check, and records beyond the first 5,000 are included. Pages
 * use the transaction's consistent snapshot. Invalid active geometry fails closed rather
 * than silently dropping a hard-block rule.
 */
export async function protectedZoneAt(lat: number, lng: number, tx: FirebaseFirestore.Transaction): Promise<ProtectedZone | null> {
  const query = db.collection('protected_zones').where('active', '==', true).orderBy(FieldPath.documentId());
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let best: { zone: ProtectedZone; distance: number } | null = null;
  while (true) {
    const page: FirebaseFirestore.QuerySnapshot = await tx.get((cursor ? query.startAfter(cursor) : query).limit(PAGE_SIZE));
    for (const doc of page.docs) {
      const zone = validatedProtectedZone(doc.data());
      if (!zone) throw new HttpsError('failed-precondition', 'An active protected zone has invalid geometry');
      const distance = distanceMeters(lat, lng, zone.lat, zone.lng);
      if (distance <= zone.radius_meters && (!best || distance < best.distance)) best = { zone, distance };
    }
    if (page.size < PAGE_SIZE) return best?.zone ?? null;
    cursor = page.docs[page.docs.length - 1];
  }
}
