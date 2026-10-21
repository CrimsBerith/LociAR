import { HttpsError } from 'firebase-functions/v2/https';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import { validCoordinates } from './placeNoteRules';
import { forEachSequential, readPages } from './async';

/** Complete, bounded range scans. A full page is never interpreted as an empty neighbourhood. */
export async function geoCandidates(tx: FirebaseFirestore.Transaction, base: FirebaseFirestore.Query,
  lat: number, lng: number, radius: number, budget = 10_000): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const prefixes = geohashCoverPrefixes(lat, lng, radius);
  const delta = radius / 6_371_008.8 * 180 / Math.PI;
  const ranges = prefixes.length
    ? prefixes.map(p => base.orderBy('geohash').orderBy('__name__').startAt(p).endAt(p + '\uf8ff'))
    : [base.where('lat', '>=', Math.max(-90, lat - delta)).where('lat', '<=', Math.min(90, lat + delta)).orderBy('lat').orderBy('__name__')];
  const found = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  let scanned = 0;
  await forEachSequential(ranges, async range => {
    const pages = readPages(async (cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined) => {
      // One look-ahead record distinguishes exactly-budget complete scans from truncated ones.
      const size = Math.min(250, budget - scanned + 1);
      const page = await tx.get((cursor ? range.startAfter(cursor) : range).limit(size));
      scanned += page.size;
      if (scanned > budget) throw new HttpsError('resource-exhausted', 'Location search is too dense; retry in a smaller area');
      return { value: page, next: page.size < size ? undefined : page.docs.at(-1) };
    });
    for await (const page of pages) {
      for (const doc of page.docs) {
        const a = doc.get('lat'), b = doc.get('lng');
        if (validCoordinates(a, b) && distanceMeters(lat, lng, a, b) <= radius) found.set(doc.id, doc);
      }
    }
  });
  return [...found.values()];
}
