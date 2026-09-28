/**
 * Minimal geohash implementation shared (by algorithm) with the iOS client (Geohash.swift).
 * Standard base32 geohash, identical to geofire-common's geohashForLocation.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const EARTH_RADIUS_M = 6_371_008.8;

export function encodeGeohash(latitude: number, longitude: number, precision = 10): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (longitude >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch = ch << 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch = ch << 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Cell height/width in meters for a geohash precision at a latitude. */
function cellSizeMeters(precision: number, latitude: number): { height: number; width: number; dLat: number; dLng: number } {
  const bits = precision * 5;
  const latBits = Math.floor(bits / 2);
  const lngBits = Math.ceil(bits / 2);
  const dLat = 180 / 2 ** latBits;
  const dLng = 360 / 2 ** lngBits;
  const height = (dLat * Math.PI * EARTH_RADIUS_M) / 180;
  const width = (dLng * Math.PI * EARTH_RADIUS_M * Math.max(0.01, Math.cos((latitude * Math.PI) / 180))) / 180;
  return { height, width, dLat, dLng };
}

/**
 * Returns geohash prefixes covering a circle: the center cell and its 8 neighbours at the
 * finest precision whose cells are at least `radius` in both dimensions. Returns [] when the
 * radius is too large for geohash filtering (caller should fall back to an unfiltered query).
 */
export function geohashCoverPrefixes(latitude: number, longitude: number, radiusMeters: number): string[] {
  let chosen = 0;
  for (let p = 1; p <= 9; p++) {
    const size = cellSizeMeters(p, latitude);
    if (Math.min(size.height, size.width) >= radiusMeters) chosen = p; else break;
  }
  if (chosen === 0) return [];
  const { dLat, dLng } = cellSizeMeters(chosen, latitude);
  const prefixes = new Set<string>();
  for (const i of [-1, 0, 1]) {
    for (const j of [-1, 0, 1]) {
      const lat = Math.max(-89.999999, Math.min(89.999999, latitude + i * dLat));
      let lng = longitude + j * dLng;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      prefixes.add(encodeGeohash(lat, lng, chosen));
    }
  }
  return [...prefixes].sort();
}
