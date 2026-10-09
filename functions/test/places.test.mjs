import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPlace } from '../lib/places.js';

const galata = { id: 'galata', name: 'Galata Kulesi', city: 'istanbul', lat: 41.025639, lng: 28.974167, radius_meters: 120 };
const karakoy = { id: 'karakoy', name: 'Karaköy', city: 'istanbul', lat: 41.0245, lng: 28.9745, radius_meters: 200 };

test('a point inside a place radius matches it', () => {
  assert.equal(matchPlace(41.0257, 28.9742, [galata])?.id, 'galata');
});

test('a point outside every radius matches nothing', () => {
  assert.equal(matchPlace(41.05, 29.0, [galata, karakoy]), null);
  assert.equal(matchPlace(41.0257, 28.9742, []), null);
});

test('overlapping places resolve to the closest centre', () => {
  // Inside both radii, but much closer to Galata's centre.
  assert.equal(matchPlace(41.02565, 28.97416, [karakoy, galata])?.id, 'galata');
});

test('equal distance resolves to the smaller id, independent of order', () => {
  const a = { ...galata, id: 'a' };
  const b = { ...galata, id: 'b' };
  assert.equal(matchPlace(galata.lat, galata.lng, [b, a])?.id, 'a');
  assert.equal(matchPlace(galata.lat, galata.lng, [a, b])?.id, 'a');
});
