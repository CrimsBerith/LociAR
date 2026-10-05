import { db, FieldValue, Timestamp } from './core';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import { MAX_POSTS_NEARBY } from './anchors';

export const POST_DENSITY_RADIUS_METERS = 25;
const EARTH_RADIUS_METERS = 6_371_008.8;
const LOCK_CELL_METERS = 50;
const PAGE_SIZE = 100;

/**
 * Fixed Earth-centered cells avoid longitude seams, poles, and latitude-dependent geohash
 * precision. Two positions within 25 m have Cartesian coordinates within 25 m on every axis,
 * so their 50 m cells differ by at most one. Each admission reads the other's center lock and
 * updates its own: a concurrent insert therefore retries before re-counting nearby posts.
 */
export function densityLockCells(lat: number, lng: number): { center: string; neighbors: string[] } {
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;
  const cell = [
    EARTH_RADIUS_METERS * Math.cos(latitude) * Math.cos(longitude),
    EARTH_RADIUS_METERS * Math.cos(latitude) * Math.sin(longitude),
    EARTH_RADIUS_METERS * Math.sin(latitude),
  ].map((coordinate) => Math.floor(coordinate / LOCK_CELL_METERS));
  const id = (x: number, y: number, z: number) => `${x}_${y}_${z}`;
  const neighbors: string[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    neighbors.push(id(cell[0] + x, cell[1] + y, cell[2] + z));
  }
  return { center: id(cell[0], cell[1], cell[2]), neighbors: neighbors.sort() };
}

/** Read before all writes in the admission transaction. Empty query results need this fence too. */
export async function readDensityLocks(tx: FirebaseFirestore.Transaction, lat: number, lng: number) {
  const cells = densityLockCells(lat, lng);
  await tx.getAll(...cells.neighbors.map((id) => db.collection('post_density_locks').doc(id)));
  return db.collection('post_density_locks').doc(cells.center);
}

export function updateDensityLock(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, now: number) {
  tx.set(ref, {
    revision: FieldValue.increment(1),
    updated_at: FieldValue.serverTimestamp(),
    // A dormant lock can expire safely: reads/creates still participate in transaction conflicts.
    expires_at: Timestamp.fromMillis(now + 2 * 86_400_000),
  }, { merge: true });
}

/** Exact distance filtering, complete pages, and early termination only once rejection is certain. */
export async function activeDensity(lat: number, lng: number, tx: FirebaseFirestore.Transaction): Promise<number> {
  const prefixes = geohashCoverPrefixes(lat, lng, POST_DENSITY_RADIUS_METERS);
  let count = 0;
  for (const prefix of prefixes.length ? prefixes : [null]) {
    let query = db.collection('posts').where('status', 'in', ['active', 'pending_review']).orderBy('geohash');
    if (prefix !== null) query = query.startAt(prefix).endAt(`${prefix}~`);
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (true) {
      const page: FirebaseFirestore.QuerySnapshot = await tx.get((cursor ? query.startAfter(cursor) : query).limit(PAGE_SIZE));
      for (const doc of page.docs) {
        const post = doc.data();
        if (distanceMeters(lat, lng, post.lat, post.lng) <= POST_DENSITY_RADIUS_METERS && ++count >= MAX_POSTS_NEARBY) return count;
      }
      if (page.size < PAGE_SIZE) break;
      cursor = page.docs[page.docs.length - 1];
    }
  }
  return count;
}
