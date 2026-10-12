/**
 * Pure location-note policy shared by the callables, the density trigger and unit tests.
 * The iOS client mirrors the entry rule and the radius tiers (LocationNotePolicy.swift).
 */
import { distanceMeters, encodeGeohash } from './geo';

export type FixSource = 'geospatial' | 'gps' | 'manual';
export type Fix = { lat: number; lng: number; accuracy: number; measuredAt: number };

export const MIN_NOTIFY_RADIUS_M = 15;
export const MAX_NOTIFY_RADIUS_M = 100;
/** Default radius for an AR post that an administrator approves without choosing one. */
export const DEFAULT_AR_NOTIFY_RADIUS_M = 20;
/** Worst creation accuracy; above it the app asks the author to wait or move outside. */
export const MAX_CREATE_ACCURACY_M = 50;
/** A manual pin may move at most this far from the measured position. */
export const MAX_PIN_DRAG_M = 50;
/** Entry fixes worse than this are discarded; GPS indoors is often 15-50 m. */
export const MAX_ENTRY_ACCURACY_M = 35;
/** How much of the visitor's uncertainty may extend the note radius. */
export const ENTRY_TOLERANCE_CAP_M = 20;
export const MAX_FIX_AGE_MS = 10_000;
/** Two agreeing fixes must be at least this far apart in time. */
export const MIN_CONFIRMATION_MS = 5_000;
/** The native precise window lasts at most 10 minutes. */
export const MAX_CONFIRMATION_MS = 600_000;
export const CLUSTER_RADIUS_M = 25;
export const WAKE_RADIUS_MIN_M = 150;
export const WAKE_RADIUS_MAX_M = 400;
export const REGION_SEARCH_RADIUS_M = 3_000;
export const DENSITY_PRECISIONS = [4, 5, 6, 7] as const;

export function validCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

/** Radius tier from how the author's position was measured. Administrators may change it later. */
export function defaultNotifyRadius(source: FixSource, accuracy: number): number {
  if (source === 'geospatial' && accuracy <= 5) return 15;
  if (source !== 'manual' && accuracy <= 10) return 20;
  if (source !== 'manual' && accuracy <= 15) return 25;
  return 30;
}

export function clampNotifyRadius(value: unknown, fallback = DEFAULT_AR_NOTIFY_RADIUS_M): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_NOTIFY_RADIUS_M, Math.max(MIN_NOTIFY_RADIUS_M, Math.round(n)));
}

/** The visitor's uncertainty circle may touch the note circle, within a bounded tolerance. */
export function fixInsideNote(fix: Fix, noteLat: number, noteLng: number, radius: number): boolean {
  if (!(fix.accuracy >= 0) || fix.accuracy > MAX_ENTRY_ACCURACY_M) return false;
  return distanceMeters(fix.lat, fix.lng, noteLat, noteLng) <= radius + Math.min(fix.accuracy, ENTRY_TOLERANCE_CAP_M);
}

export function fixIsFresh(fix: Fix, now: number): boolean {
  return validCoordinates(fix.lat, fix.lng) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0
    && Number.isFinite(fix.measuredAt) && fix.measuredAt >= now - MAX_FIX_AGE_MS && fix.measuredAt <= now + 5_000;
}

/** The first agreeing fix must precede the submitted one by 5 s to 10 min. */
export function confirmationValid(confirmationStartedAt: unknown, fix: Fix): boolean {
  return typeof confirmationStartedAt === 'number' && Number.isFinite(confirmationStartedAt)
    && confirmationStartedAt <= fix.measuredAt - MIN_CONFIRMATION_MS
    && confirmationStartedAt >= fix.measuredAt - MAX_CONFIRMATION_MS;
}

export type RankedNote = { id: string; lat: number; lng: number; radius: number; likes: number; createdAtMs: number };

/** Most-liked first; newer first on ties; id keeps the order total. */
export function compareByLikes(a: RankedNote, b: RankedNote): number {
  return b.likes - a.likes || b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id);
}

export type NoteCluster = { id: string; lat: number; lng: number; radius: number; triggerRadius: number; notes: Array<{ lat: number; lng: number; r: number }> };

/**
 * Greedy 25 m grouping seeded by the most-liked note. The wake circle covers every member's
 * trigger circle plus a walking margin, within iOS-friendly bounds.
 */
export function clusterNotes(notes: RankedNote[]): NoteCluster[] {
  const groups: RankedNote[][] = [];
  for (const note of [...notes].sort(compareByLikes)) {
    const group = groups.find(g => distanceMeters(g[0].lat, g[0].lng, note.lat, note.lng) <= CLUSTER_RADIUS_M);
    if (group) group.push(note); else groups.push([note]);
  }
  return groups.map(group => {
    const lat = group.reduce((s, n) => s + n.lat, 0) / group.length;
    const lng = group.reduce((s, n) => s + n.lng, 0) / group.length;
    const reach = Math.max(...group.map(n => distanceMeters(lat, lng, n.lat, n.lng) + n.radius));
    return {
      id: group[0].id, lat, lng,
      radius: Math.min(WAKE_RADIUS_MAX_M, Math.max(WAKE_RADIUS_MIN_M, Math.ceil(reach + 50))),
      triggerRadius: Math.max(...group.map(n => n.radius)),
      notes: group.map(n => ({ lat: n.lat, lng: n.lng, r: n.radius })),
    };
  });
}

export function densityCells(lat: number, lng: number): string[] {
  return DENSITY_PRECISIONS.map(p => `${p}_${encodeGeohash(lat, lng, p)}`);
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Bounds of one geohash cell. */
export function geohashBounds(hash: string) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, even = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error('invalid geohash');
    for (let bit = 4; bit >= 0; bit--) {
      const on = (value >> bit) & 1;
      if (even) { const mid = (lngMin + lngMax) / 2; if (on) lngMin = mid; else lngMax = mid; }
      else { const mid = (latMin + latMax) / 2; if (on) latMin = mid; else latMax = mid; }
      even = !even;
    }
  }
  return { latMin, latMax, lngMin, lngMax, lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 };
}

export type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** Every geohash cell of `precision` intersecting the box, or null when there are more than `limit`. */
export function geohashesInBox(box: Box, precision: number, limit: number): string[] | null {
  const bits = precision * 5;
  const cellLat = 180 / 2 ** Math.floor(bits / 2), cellLng = 360 / 2 ** Math.ceil(bits / 2);
  // Sampling every cell height/width plus the far edge visits each row and column once.
  const steps = (min: number, max: number, size: number) => {
    const values: number[] = [];
    for (let v = min; v < max; v += size) values.push(v);
    values.push(max);
    return values;
  };
  const lats = steps(box.minLat, box.maxLat, cellLat), lngs = steps(box.minLng, box.maxLng, cellLng);
  if (lats.length * lngs.length > 4 * limit) return null;
  const cells = new Set<string>();
  for (const lat of lats) for (const lng of lngs) cells.add(encodeGeohash(Math.min(lat, 90 - 1e-9), Math.min(lng, 180 - 1e-9), precision));
  return cells.size > limit ? null : [...cells].sort();
}

/** Coarsest-useful prefix set for range queries: the finest precision with at most `maxPrefixes` cells. */
export function densityQueryPrefixes(box: Box, precision: number, maxPrefixes = 12): string[] {
  for (let q = precision; q >= 1; q--) {
    const cells = geohashesInBox(box, q, maxPrefixes);
    if (cells) return cells;
  }
  return geohashesInBox(box, 1, 32) ?? [];
}

export function validBox(value: unknown): value is Box {
  const b = value as Box;
  return !!b && [b.minLat, b.maxLat].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 90)
    && [b.minLng, b.maxLng].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180)
    && b.minLat <= b.maxLat && b.minLng <= b.maxLng;
}
