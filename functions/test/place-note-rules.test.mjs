import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGeohash } from '../lib/geo.js';
import {
  clampNotifyRadius, clusterNotes, compareByLikes, confirmationValid, defaultNotifyRadius, densityCells, densityQueryPrefixes,
  fixInsideNote, fixIsFresh, geohashBounds, geohashesInBox, validBox,
} from '../lib/placeNoteRules.js';

const METER = 1 / 111_320; // degrees of latitude per metre
const at = (north, accuracy, measuredAt = Date.now()) => ({ lat: 41 + north * METER, lng: 29, accuracy, measuredAt });

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

test('fixes must be fresh and confirmed by an earlier fix 5 s to 10 min before', () => {
  const now = Date.now(), fix = at(0, 5, now - 1000);
  assert.equal(fixIsFresh(fix, now), true);
  assert.equal(fixIsFresh(at(0, 5, now - 11_000), now), false);
  assert.equal(confirmationValid(now - 7000, fix), true);
  assert.equal(confirmationValid(now - 4000, fix), false);
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
  assert.ok(clusters[0].radius >= 150 && clusters[0].radius <= 400);
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
