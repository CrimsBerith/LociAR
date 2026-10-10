import { db } from './core';
import { distanceMeters } from './geo';

/** A curated landmark. Documents in `places` are written by an operator script only (rules: public read). */
export type Place = { id: string; name: string; city: string; lat: number; lng: number; radius_meters: number };

const PLACE_CACHE_MS = 5 * 60 * 1000;
let placeCache: { at: number; places: Place[] } | null = null;

function isPlace(value: unknown): value is Place {
  const p = value as Partial<Place> | null;
  return !!p && typeof p.id === 'string' && typeof p.lat === 'number' && typeof p.lng === 'number'
    && typeof p.radius_meters === 'number' && p.radius_meters > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/** The closest place whose radius contains the point, or null. Ties go to the smaller id. */
export function matchPlace(lat: number, lng: number, places: readonly Place[]): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const place of places) {
    const distance = distanceMeters(lat, lng, place.lat, place.lng);
    if (distance > place.radius_meters) continue;
    if (!best || distance < best.distance || (distance === best.distance && place.id < best.place.id)) best = { place, distance };
  }
  return best?.place ?? null;
}

/** Server-side place of a post location; never trusts the client. Failures return null (the post still publishes). */
export async function placeAt(lat: number, lng: number): Promise<Place | null> {
  try {
    if (!placeCache || Date.now() - placeCache.at > PLACE_CACHE_MS) {
      const snap = await db.collection('places').where('active', '==', true).limit(200).get();
      placeCache = {
        at: Date.now(),
        places: snap.docs.map((d) => ({ ...(d.data() as Omit<Place, 'id'>), id: d.id })).filter(isPlace),
      };
    }
    return matchPlace(lat, lng, placeCache.places);
  } catch {
    return null;
  }
}
