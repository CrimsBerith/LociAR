import test from 'node:test';
import assert from 'node:assert/strict';
import { densityLockCells } from '../lib/postAdmission.js';
import { distanceMeters, encodeGeohash, geohashCoverPrefixes } from '../lib/geo.js';
import { validatedProtectedZone } from '../lib/protectedZones.js';

function destination(lat, lng, meters, bearing) {
  const radians = Math.PI / 180;
  const angular = meters / 6_371_008.8;
  const latitude = lat * radians;
  const longitude = lng * radians;
  const nextLat = Math.asin(Math.sin(latitude) * Math.cos(angular)
    + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
  const nextLng = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
    Math.cos(angular) - Math.sin(latitude) * Math.sin(nextLat));
  return [nextLat / radians, ((nextLng / radians + 180) % 360 + 360) % 360 - 180];
}

test('nearby admission locks serialize across cell boundaries, longitude seam and poles', () => {
  for (const [lat, lng] of [[0, 0], [41.0082, 28.9784], [-33.86, 151.21], [0, 179.99999], [89.99999, 170], [-89.99999, -170]]) {
    const origin = densityLockCells(lat, lng);
    for (let angle = 0; angle < 360; angle += 5) {
      const [nextLat, nextLng] = destination(lat, lng, 24.9, angle * Math.PI / 180);
      assert.ok(distanceMeters(lat, lng, nextLat, nextLng) < 25);
      const next = densityLockCells(nextLat, nextLng);
      assert.ok(origin.neighbors.includes(next.center), `origin reads other's write at ${lat},${lng}, bearing ${angle}`);
      assert.ok(next.neighbors.includes(origin.center), `other reads origin's write at ${lat},${lng}, bearing ${angle}`);
    }
  }
});

test('geohash density queries cover spherical circles at seams and high latitudes or request a full scan', () => {
  for (const [lat, lng] of [[41, 29], [0, 179.99999], [89.99, 179], [89.99999, -170], [-89.99999, 170]]) {
    const prefixes = geohashCoverPrefixes(lat, lng, 25);
    for (let angle = 0; angle < 360; angle += 5) {
      const point = destination(lat, lng, 24.9, angle * Math.PI / 180);
      const hash = encodeGeohash(...point, 10);
      assert.ok(!prefixes.length || prefixes.some((prefix) => hash.startsWith(prefix)), `uncovered ${point}`);
    }
  }
  assert.deepEqual(geohashCoverPrefixes(89.99999, 0, 25), [], 'polar circle requires the complete-query fallback');
});

test('active protected zone geometry requires finite legal coordinates and a positive radius', () => {
  const valid = { name: 'Zone', category: 'test', lat: 41, lng: 29, radius_meters: 10 };
  assert.deepEqual(validatedProtectedZone(valid), valid);
  for (const changes of [{ lat: NaN }, { lat: Infinity }, { lat: 91 }, { lng: -181 }, { lng: '29' }, { radius_meters: 0 }, { radius_meters: -1 }, { radius_meters: Infinity }]) {
    assert.equal(validatedProtectedZone({ ...valid, ...changes }), null);
  }
});
