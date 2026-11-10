/**
 * Minimal geohash implementation shared (by algorithm) with the iOS client (Geohash.swift).
 * Standard base32 geohash, identical to geofire-common's geohashForLocation.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const EARTH_RADIUS_M = 6_371_008.8;

/** Mean of nearby longitudes, keeping neighbours across ±180° in the same place. */
export function meanLongitude(longitudes: number[]): number {
  const anchor = longitudes[0];
  const delta = longitudes.reduce((sum, lng) => sum + ((lng - anchor + 540) % 360 - 180), 0) / longitudes.length;
  return (anchor + delta + 540) % 360 - 180;
}

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

/** Prefix range queries per cover. More, smaller cells read far fewer rows than one cell much larger than the circle. */
export const MAX_COVER_CELLS = 16;
/** Never finer than ~150 m cells: below that each extra empty range query costs more than the rows it saves. */
const FINEST_COVER_PRECISION = 7;

/** Conservative spherical bounding box of a circle, or null when it reaches a pole. */
export function circleBox(latitude: number, longitude: number, radiusMeters: number) {
  const angularRadius = radiusMeters / EARTH_RADIUS_M;
  const latRadians = latitude * Math.PI / 180;
  if (!Number.isFinite(angularRadius) || angularRadius < 0
    || Math.abs(latRadians) + angularRadius >= Math.PI / 2) return null;
  const dLat = angularRadius * 180 / Math.PI;
  const dLng = Math.asin(Math.sin(angularRadius) / Math.cos(latRadians)) * 180 / Math.PI;
  return { latMin: latitude - dLat, latMax: latitude + dLat, lngMin: longitude - dLng, lngMax: longitude + dLng };
}

/**
 * Every geohash cell of one precision that touches the box, or null when there would be more than
 * `limit`. Longitudes wrap across ±180°; a tiny margin keeps points on a cell edge covered.
 */
export function geohashGrid(box: NonNullable<ReturnType<typeof circleBox>>, precision: number, limit: number): string[] | null {
  const bits = precision * 5;
  const latRows = 2 ** Math.floor(bits / 2), lngCols = 2 ** Math.ceil(bits / 2);
  const cellLat = 180 / latRows, cellLng = 360 / lngCols, margin = 1e-9;
  const rowFrom = Math.max(0, Math.floor((box.latMin - margin + 90) / cellLat));
  const rowTo = Math.min(latRows - 1, Math.floor((box.latMax + margin + 90) / cellLat));
  const colFrom = Math.floor((box.lngMin - margin + 180) / cellLng), colTo = Math.floor((box.lngMax + margin + 180) / cellLng);
  const rows = rowTo - rowFrom + 1, cols = Math.min(colTo - colFrom + 1, lngCols);
  if (rows * cols > limit) return null;
  const cells = new Set<string>();
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let col = colFrom; col < colFrom + cols; col++) {
      const lng = -180 + (col + 0.5) * cellLng;
      cells.add(encodeGeohash(-90 + (row + 0.5) * cellLat, ((lng + 180) % 360 + 360) % 360 - 180, precision));
    }
  }
  return [...cells].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Prefixes whose cells together contain the whole circle: the finest precision that needs at most
 * `maxCells` cells, so a 1 km map search reads about 1 km² of rows instead of whole 5 km cells.
 * Circles reaching a pole or spanning too much of Earth return [], requesting the caller's
 * complete-query fallback.
 */
export function geohashCoverPrefixes(latitude: number, longitude: number, radiusMeters: number, maxCells = MAX_COVER_CELLS): string[] {
  const box = circleBox(latitude, longitude, radiusMeters);
  if (!box) return [];
  for (let precision = FINEST_COVER_PRECISION; precision >= 1; precision--) {
    const cells = geohashGrid(box, precision, maxCells);
    if (cells) return cells;
  }
  return [];
}
