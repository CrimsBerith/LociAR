import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGeohash } from '../lib/geo.js';
import {
  clampNotifyRadius, clusterNotes, compareByLikes, confirmationValid, defaultNotifyRadius, densityCells, densityQueryPrefixes,
  fixInsideNote, fixIsFresh, geohashBounds, geohashesInBox, validBox, campaignEntryRadius, distanceToSpot, fixUnlocksSpot, joinSpot, spotOf, stableUuid,
  deliveryRetryActive, DELIVERY_RETRY_WINDOW_MS,
} from '../lib/placeNoteRules.js';

const METER = 1 / 111_320; // degrees of latitude per metre
const at = (north, accuracy, measuredAt = Date.now()) => ({ lat: 41 + north * METER, lng: 29, accuracy, measuredAt });

test('delivery retry windows expire exactly at one day and malformed/future receipts fail closed', () => {
  const now = 1_800_000_000_000, day = 86_400_000;
  assert.equal(DELIVERY_RETRY_WINDOW_MS, day);
  assert.equal(deliveryRetryActive(now - day + 1, now), true);
  assert.equal(deliveryRetryActive(now - day, now), false);
  assert.equal(deliveryRetryActive(now - day - 1, now, now + day), false, 'a stored deadline cannot extend a legacy receipt');
  assert.equal(deliveryRetryActive(now - 1000, now, now), false, 'a stored deadline may shorten retries');
  for (const value of [null, NaN, Infinity, now + 10_001]) assert.equal(deliveryRetryActive(value, now), false);
});

test('radius tiers follow how the author position was measured', () => {
  assert.equal(defaultNotifyRadius('geospatial', 3), 15);
  assert.equal(defaultNotifyRadius('geospatial', 8), 20);
  assert.equal(defaultNotifyRadius('gps', 9), 20);
  assert.equal(defaultNotifyRadius('gps', 14), 25);
  assert.equal(defaultNotifyRadius('manual', 4), 30);
  assert.equal(clampNotifyRadius(3), 15);
  assert.equal(clampNotifyRadius(500), 100);
  assert.equal(clampNotifyRadius(undefined), 20);
});

test('entry rule lets the uncertainty circle touch the note, with a capped tolerance', () => {
  // 20 m note: a 30 m distance passes with 10 m accuracy, fails with 5 m.
  assert.equal(fixInsideNote(at(30, 10), 41, 29, 20), true);
  assert.equal(fixInsideNote(at(30, 5), 41, 29, 20), false);
  // Tolerance stops at 20 m even when accuracy is 30 m.
  assert.equal(fixInsideNote(at(39, 30), 41, 29, 20), true);
  assert.equal(fixInsideNote(at(41, 30), 41, 29, 20), false);
  // Fixes worse than 35 m never count, even on top of the note.
  assert.equal(fixInsideNote(at(0, 36), 41, 29, 20), false);
  // The old 2.5 m rule rejected every realistic phone fix; a typical 8 m fix at the door now passes.
  assert.equal(fixInsideNote(at(12, 8), 41, 29, 20), true);
});

test('fixes must be fresh and confirmed by an earlier fix 10 s to 10 min before', () => {
  const now = Date.now(), fix = at(0, 5, now - 1000);
  assert.equal(fixIsFresh(fix, now), true);
  assert.equal(fixIsFresh(at(0, 5, now - 11_000), now), false);
  assert.equal(confirmationValid(now - 11_000, fix), true);
  assert.equal(confirmationValid(now - 10_999, fix), false);
  assert.equal(confirmationValid(now - 7000, fix), false);
  assert.equal(confirmationValid(now - 700_000, fix), false);
  assert.equal(confirmationValid(undefined, fix), false);
});

test('most liked notes rank first and seed their cluster', () => {
  const note = (id, north, likes, createdAtMs = 0) => ({ id, lat: 41 + north * METER, lng: 29, radius: 20, likes, createdAtMs });
  const a = note('a', 0, 2), b = note('b', 10, 9), c = note('c', 200, 1), d = note('d', 5, 9, 5);
  assert.deepEqual([a, b, c, d].sort(compareByLikes).map(n => n.id), ['d', 'b', 'a', 'c']);
  const clusters = clusterNotes([a, b, c, d]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].id, 'd');
  assert.equal(clusters[0].notes.length, 3);
  assert.ok(clusters[0].radius >= 300 && clusters[0].radius <= 400);
  assert.equal(clusters[1].id, 'c');
});

test('density cells cover precisions 4 to 7 and box enumeration finds every intersecting cell', () => {
  const cells = densityCells(41.0082, 28.9784);
  assert.deepEqual(cells, ['4_sxk9', '5_sxk97', '6_sxk973', '7_sxk973m']);
  const bounds = geohashBounds('sxk973m');
  assert.ok(bounds.latMin <= 41.0082 && bounds.latMax >= 41.0082 && bounds.lngMin <= 28.9784 && bounds.lngMax >= 28.9784);
  const box = { minLat: 41.0, maxLat: 41.02, minLng: 28.96, maxLng: 28.99 };
  const p6 = geohashesInBox(box, 6, 500);
  for (const [lat, lng] of [[41.0, 28.96], [41.02, 28.99], [41.01, 28.975], [41.0, 28.99]]) assert.ok(p6.includes(encodeGeohash(lat, lng, 6)));
  assert.equal(geohashesInBox({ minLat: 30, maxLat: 50, minLng: 10, maxLng: 40 }, 7, 500), null);
  const prefixes = densityQueryPrefixes(box, 7);
  assert.ok(prefixes.length >= 1 && prefixes.length <= 12);
  assert.ok(prefixes.every(p => encodeGeohash(41.01, 28.975, 7).length >= p.length));
  assert.equal(validBox(box), true);
  assert.equal(validBox({ ...box, minLat: 42 }), false);
});

test('spot joins preserve the fixed centre, reject members beyond 6 m and cap GPS tolerance', () => {
  const p = (north, east = 0) => ({ lat: 41 + north * METER, lng: 29 + east * METER / Math.cos(41 * Math.PI / 180) });
  const seed = spotOf([p(0), p(4), p(-4), p(0, 4), p(0, -4)]);
  assert.equal(seed.count, 5); assert.ok(Math.abs(seed.lat - 41) < 1e-7); assert.ok(seed.radius > 3.9 && seed.radius < 4.1);
  const grown = joinSpot(seed, p(5.99).lat, p(5.99).lng);
  assert.equal(grown.count, 6);
  assert.equal(grown.lat, seed.lat); assert.equal(grown.lng, seed.lng);
  assert.ok(grown.radius >= 5.9 && grown.radius <= 6);
  assert.throws(() => joinSpot(seed, p(6.1).lat, p(6.1).lng), /outside 6 m/);
  assert.throws(() => joinSpot({ ...seed, radius: 39 }, p(80).lat, p(80).lng), /outside 6 m/);
  const spot = { lat: 41, lng: 29, radius: 10 };
  assert.equal(distanceToSpot(41, 29, spot), 0);
  const fix = (north, accuracy) => ({ ...p(north), accuracy, measuredAt: Date.now() });
  assert.equal(fixUnlocksSpot(fix(14, 3), spot, 2), true, '10 m spot + 2 m + 3 m AR accuracy');
  assert.equal(fixUnlocksSpot(fix(16, 3), spot, 2), false);
  assert.equal(fixUnlocksSpot(fix(29, 30), spot, 15), true, 'GPS tolerance stops at 5 m');
  assert.equal(fixUnlocksSpot(fix(31, 30), spot, 15), false);
  assert.equal(fixUnlocksSpot(fix(0, 40), spot, 15), false);
  assert.match(stableUuid('dense:abc'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(campaignEntryRadius(undefined), 30); assert.equal(campaignEntryRadius(2.5), 15);
});

test('persistent spot seeding and growth preserve neighbours across the date line', () => {
  const seed = spotOf([{ lat: 0, lng: 179.99995 }, { lat: 0, lng: -179.99995 }]);
  assert.ok(Math.abs(seed.lng) > 179.9999);
  assert.ok(seed.radius > 5 && seed.radius < 6);
  const grown = joinSpot(seed, 0, 179.99996);
  assert.ok(Math.abs(grown.lng) > 179.9999);
  assert.ok(grown.radius <= 6);
});
