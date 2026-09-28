import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGeohash, distanceMeters, geohashCoverPrefixes } from '../lib/geo.js';

test('encodes known geohashes', () => {
  assert.equal(encodeGeohash(57.64911, 10.40744, 11), 'u4pruydqqvj'); // verified against geofire-common + ngeohash
  assert.equal(encodeGeohash(41.0082, 28.9784, 7), 'sxk973m');
  assert.equal(encodeGeohash(37.3349, -122.009, 6), '9q9hrs');
});

test('cover prefixes contain every point inside the radius', () => {
  const cases = [[41.0082, 28.9784, 120], [41.0082, 28.9784, 50_000], [37.3349, -122.009, 25], [-33.86, 151.21, 5000], [0.0001, 179.999, 1000]];
  for (const [lat, lng, radius] of cases) {
    const prefixes = geohashCoverPrefixes(lat, lng, radius);
    assert.ok(prefixes.length >= 1 && prefixes.length <= 9, `prefix count for r=${radius}`);
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
