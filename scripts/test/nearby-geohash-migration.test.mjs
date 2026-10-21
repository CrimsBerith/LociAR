import test from 'node:test';
import assert from 'node:assert/strict';
import { desiredGeohash } from '../nearby-geohash-migration.mjs';

test('migration rejects missing, string, nonfinite and out-of-range coordinates', () => {
  for (const post of [{}, { lat: '41', lng: 29 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) assert.equal(desiredGeohash(post), null);
});
test('migration derives the same coordinate index independently of a stale existing hash', () => {
  assert.equal(desiredGeohash({ lat: 0, lng: 0 }), 's000000000');
  assert.equal(desiredGeohash({ lat: 41, lng: 29, geohash: 'stale' }), desiredGeohash({ lat: 41, lng: 29 }));
  for (const point of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }]) assert.match(desiredGeohash(point), /^[0-9bcdefghjkmnpqrstuvwxyz]{10}$/);
});
