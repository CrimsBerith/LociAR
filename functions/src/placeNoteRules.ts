/**
 * Pure location-note policy shared by the callables, the density trigger and unit tests.
 * The iOS client mirrors the entry rule and the radius tiers (LocationNotePolicy.swift).
 */
import { createHash } from 'node:crypto';
import { distanceMeters, encodeGeohash, meanLongitude } from './geo';

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
export const MIN_CONFIRMATION_MS = 10_000;
/** The native precise window lasts at most 10 minutes. */
export const MAX_CONFIRMATION_MS = 600_000;
/** Matches PlaceNoteDeliveryAttempt on iOS. Lifetime post receipts themselves never expire. */
export const DELIVERY_RETRY_WINDOW_MS = 86_400_000;
export function deliveryRetryActive(createdAtMs: number | null, now: number, retryUntilMs?: number | null): boolean {
  if (createdAtMs === null || !Number.isFinite(createdAtMs) || !Number.isFinite(now) || createdAtMs > now + 10_000) return false;
  const deadline = createdAtMs + DELIVERY_RETRY_WINDOW_MS;
  // A stored deadline may shorten the window, but can never extend it beyond one day.
  const until = typeof retryUntilMs === 'number' && Number.isFinite(retryUntilMs) ? Math.min(deadline, retryUntilMs) : deadline;
  return now < until;
}
export const CLUSTER_RADIUS_M = 25;
/** Wake ahead of the note so GPS can settle before a visitor reaches a shop-sized circle. */
export const WAKE_RADIUS_MIN_M = 300;
export const WAKE_RADIUS_MAX_M = 400;
export const REGION_SEARCH_RADIUS_M = 3_000;
export const DENSITY_PRECISIONS = [4, 5, 6, 7] as const;
/** Notes within this distance of a spot's centre join it; a spot forms from this many neighbours. */
export const SPOT_JOIN_RADIUS_M = 25;
export const MIN_SPOT_SIZE = 5;
export const MAX_SPOT_RADIUS_M = 40;
/** A spot with at least this many public notes is a dense spot (admin setting, 5-1000). */
export const DEFAULT_DENSE_THRESHOLD = 30;
/** Dense-spot notes open only within this distance of the spot cell (admin setting, 2-50 m). */
export const DEFAULT_UNLOCK_RADIUS_M = 15;
export const MIN_UNLOCK_RADIUS_M = 2;
export const MAX_UNLOCK_RADIUS_M = 50;
/** GPS uncertainty may extend the unlock radius by at most this much; AR Geospatial reports 1-5 m. */
export const UNLOCK_TOLERANCE_CAP_M = 5;
export const UNLOCK_TTL_MS = 30 * 60_000;
/** Text-free "many notes here" alerts fire within this radius of the spot centre. */
export const SPOT_TRIGGER_RADIUS_M = 25;
export const DEFAULT_CAMPAIGN_ENTRY_RADIUS_M = 30;

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
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > MAX_ENTRY_ACCURACY_M) return false;
  return distanceMeters(fix.lat, fix.lng, noteLat, noteLng) <= radius + Math.min(fix.accuracy, ENTRY_TOLERANCE_CAP_M);
}

export function fixIsFresh(fix: Fix, now: number): boolean {
  return validCoordinates(fix.lat, fix.lng) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0
    && Number.isFinite(fix.measuredAt) && fix.measuredAt >= now - MAX_FIX_AGE_MS && fix.measuredAt <= now + 5_000;
}

/** The first agreeing fix must precede the submitted one by 10 s to 10 min. */
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
    const group = groups.find(g => g.length < 50 && distanceMeters(g[0].lat, g[0].lng, note.lat, note.lng) <= CLUSTER_RADIUS_M);
    if (group) group.push(note); else groups.push([note]);
  }
  return groups.map(group => {
    const lat = group.reduce((s, n) => s + n.lat, 0) / group.length;
    const lng = meanLongitude(group.map(n => n.lng));
    const reach = Math.max(...group.map(n => distanceMeters(lat, lng, n.lat, n.lng) + n.radius));
    return {
      id: group[0].id, lat, lng,
      radius: Math.min(WAKE_RADIUS_MAX_M, Math.max(WAKE_RADIUS_MIN_M, Math.ceil(reach + 50))),
      triggerRadius: Math.max(...group.map(n => n.radius)),
      notes: group.map(n => ({ lat: n.lat, lng: n.lng, r: n.radius })),
    };
  });
}

/** Campaign arrivals use the same GPS-tolerant rule as notes, with a 15-100 m radius (default 30 m). */
export function campaignEntryRadius(value: unknown): number {
  return clampNotifyRadius(value, DEFAULT_CAMPAIGN_ENTRY_RADIUS_M);
}

export type Spot = { lat: number; lng: number; radius: number };

/** Membership is measured from the fixed centre, never from the circle's edge. */
export function distanceToSpot(lat: number, lng: number, spot: Spot): number {
  return distanceMeters(lat, lng, spot.lat, spot.lng);
}

/** Unlock a dense spot: within the unlock radius of its circle, GPS tolerance capped at 5 m. */
export function fixUnlocksSpot(fix: Fix, spot: Spot, unlockRadius: number): boolean {
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > MAX_ENTRY_ACCURACY_M) return false;
  return Math.max(0, distanceToSpot(fix.lat, fix.lng, spot) - spot.radius) <= unlockRadius + Math.min(fix.accuracy, UNLOCK_TOLERANCE_CAP_M);
}

/** A fixed centre prevents later joins from pushing existing members outside 25 m. */
export function joinSpot(spot: Spot & { count: number }, lat: number, lng: number): Spot & { count: number } {
  const distance = distanceToSpot(lat, lng, spot);
  if (distance > SPOT_JOIN_RADIUS_M) throw new RangeError('Spot member is outside 25 m');
  return { lat: spot.lat, lng: spot.lng, radius: Math.min(SPOT_JOIN_RADIUS_M, Math.max(spot.radius, distance)), count: spot.count + 1 };
}

/** Prefer the date-line-safe mean; fall back to the seed if that mean moves a member out. */
export function spotOf(points: Array<{ lat: number; lng: number }>): Spot & { count: number } {
  if (!points.length) throw new RangeError('A spot needs a member');
  let lat = points.reduce((s, p) => s + p.lat, 0) / points.length, lng = meanLongitude(points.map(p => p.lng));
  let radius = Math.max(...points.map(p => distanceMeters(lat, lng, p.lat, p.lng)));
  if (radius > SPOT_JOIN_RADIUS_M) {
    ({ lat, lng } = points[0]);
    radius = Math.max(...points.map(p => distanceMeters(lat, lng, p.lat, p.lng)));
  }
  if (radius > SPOT_JOIN_RADIUS_M) throw new RangeError('Spot members need separate 25 m groups');
  return { lat, lng, count: points.length, radius };
}

/** Deterministic RFC 4122-shaped id for a non-post region such as a dense spot. */
export function stableUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function densityCells(lat: number, lng: number): string[] {
  return DENSITY_PRECISIONS.map(p => `${p}_${encodeGeohash(lat, lng, p)}`);
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function halfBounds(min: number, max: number, upper: number): [number, number] {
  const mid = (min + max) / 2;
  return upper ? [mid, max] : [min, mid];
}

/** Bounds of one geohash cell. */
export function geohashBounds(hash: string) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, even = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error('invalid geohash');
    for (let bit = 4; bit >= 0; bit--) {
      const on = (value >> bit) & 1;
      if (even) [lngMin, lngMax] = halfBounds(lngMin, lngMax, on);
      else [latMin, latMax] = halfBounds(latMin, latMax, on);
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
  return cells.size > limit ? null : [...cells].sort((a, b) => a.localeCompare(b, 'en'));
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
