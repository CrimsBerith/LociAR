import assert from 'node:assert/strict';
import test from 'node:test';
import { metersPerPixel, project, unproject } from '../lib/map-tiles.ts';

test('project and unproject round-trip a point', () => {
  for (const [lat, lng] of [[41.0082, 28.9784], [37.3349, -122.009], [-33.8568, 151.2153]]) {
    const p = project(lat, lng, 17), back = unproject(p.x, p.y, 17);
    assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lng - lng) < 1e-9);
  }
});

test('tile coordinates match the OpenStreetMap scheme', () => {
  // Same tile as the slippy-map formula: Istanbul (Sultanahmet) at zoom 15 is 19021/12284.
  const p = project(41.0082, 28.9784, 15);
  assert.deepEqual([Math.floor(p.x / 256), Math.floor(p.y / 256)], [19021, 12284]);
  assert.deepEqual(project(0, 0, 0), { x: 128, y: 128 });
});

test('longitudes wrap and scale shrinks with latitude', () => {
  assert.ok(Math.abs(unproject(256 * 2 + 10, 128, 1).lng - unproject(10, 128, 1).lng) < 1e-9);
  assert.ok(Math.abs(metersPerPixel(0, 0) - 156_543.03392) < 1e-6);
  assert.ok(metersPerPixel(60, 17) < metersPerPixel(0, 17) * 0.51);
});
