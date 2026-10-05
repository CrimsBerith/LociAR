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

/**
 * Conservative spherical bounding box, sampled at its edges at a precision whose cells are
 * wider/taller than the whole box. At most nine prefixes are needed. Circles reaching a pole
 * or spanning too much of Earth return [], requesting the caller's complete-query fallback.
 */
export function geohashCoverPrefixes(latitude: number, longitude: number, radiusMeters: number): string[] {
  const angularRadius = radiusMeters / EARTH_RADIUS_M;
  const latRadians = latitude * Math.PI / 180;
  if (!Number.isFinite(angularRadius) || angularRadius < 0
    || Math.abs(latRadians) + angularRadius >= Math.PI / 2) return [];
  const dLat = angularRadius * 180 / Math.PI;
  const dLng = Math.asin(Math.sin(angularRadius) / Math.cos(latRadians)) * 180 / Math.PI;
  let chosen = 0;
  for (let precision = 1; precision <= 9; precision++) {
    const bits = precision * 5;
    const cellLat = 180 / 2 ** Math.floor(bits / 2);
    const cellLng = 360 / 2 ** Math.ceil(bits / 2);
    if (cellLat >= 2 * dLat && cellLng >= 2 * dLng) chosen = precision;
    else break;
  }
  if (chosen === 0) return [];
  const prefixes = new Set<string>();
  for (const lat of [latitude - dLat, latitude, latitude + dLat]) {
    for (const lng of [longitude - dLng, longitude, longitude + dLng]) {
      const wrapped = ((lng + 180) % 360 + 360) % 360 - 180;
      prefixes.add(encodeGeohash(lat, wrapped, chosen));
    }
  }
  return [...prefixes].sort();
}
