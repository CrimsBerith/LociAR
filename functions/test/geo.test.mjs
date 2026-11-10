import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGeohash, distanceMeters, geohashCoverPrefixes, MAX_COVER_CELLS } from '../lib/geo.js';

test('encodes known geohashes', () => {
  assert.equal(encodeGeohash(57.64911, 10.40744, 11), 'u4pruydqqvj'); // verified against geofire-common + ngeohash
  assert.equal(encodeGeohash(41.0082, 28.9784, 7), 'sxk973m');
  assert.equal(encodeGeohash(37.3349, -122.009, 6), '9q9hrs');
});

test('cover prefixes contain every point inside the radius', () => {
  const cases = [[41.0082, 28.9784, 120], [41.0082, 28.9784, 50_000], [37.3349, -122.009, 25], [-33.86, 151.21, 5000], [0.0001, 179.999, 1000]];
  for (const [lat, lng, radius] of cases) {
    const prefixes = geohashCoverPrefixes(lat, lng, radius);
    assert.ok(prefixes.length >= 1 && prefixes.length <= MAX_COVER_CELLS, `prefix count for r=${radius}`);
    for (let k = 0; k < 400; k++) {
      const bearing = Math.random() * 2 * Math.PI;
      const d = Math.random() * radius;
      const pLat = lat + (d * Math.cos(bearing)) / 111_320;
      const pLng = lng + (d * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      if (distanceMeters(lat, lng, pLat, pLng) > radius) continue;
      const wrapped = pLng > 180 ? pLng - 360 : pLng;
      const hash = encodeGeohash(pLat, wrapped, 10);
      assert.ok(prefixes.some((p) => hash.startsWith(p)), `point ${pLat},${wrapped} not covered for r=${radius}`);
    }
  }
});

test('huge radius disables geohash filtering', () => {
  assert.deepEqual(geohashCoverPrefixes(41, 29, 8_000_000), []);
});

test('a 1 km map search reads cells close to its own size, not whole 5 km cells', () => {
  const cellArea = prefix => {
    const bits = prefix.length * 5;
    return (180 / 2 ** Math.floor(bits / 2)) * 111.32 * (360 / 2 ** Math.ceil(bits / 2)) * 111.32 * Math.cos(41 * Math.PI / 180);
  };
  const prefixes = geohashCoverPrefixes(41.0082, 28.9784, 1000);
  assert.ok(prefixes.every(prefix => prefix.length === 6), prefixes.join(','));
  const covered = prefixes.reduce((sum, prefix) => sum + cellArea(prefix), 0);
  assert.ok(covered < 16, `covered ${covered.toFixed(1)} km² for a 3.1 km² circle`);
  // Before: one to four precision-5 cells of about 18 km² each.
  assert.ok(covered < 2 * cellArea('sxk97'));
  // Across the antimeridian the cover wraps instead of duplicating or skipping cells.
  const seam = geohashCoverPrefixes(0.0001, 179.999, 1000);
  assert.equal(new Set(seam).size, seam.length);
  assert.ok(seam.some(prefix => encodeGeohash(0.0001, -179.995, prefix.length) === prefix));
});
