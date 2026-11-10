import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixInsideZone, fixOutsideZone, frequencyAllows, localTime, makeCode, requirementMet, scheduleAllows, zoneBounds, zoneDistance,
} from '../lib/journeyRules.js';

const M = 1 / 111_320;
const fix = (north, east, accuracy = 8) => ({ lat: 41 + north * M, lng: 29 + east * M / Math.cos(41 * Math.PI / 180), accuracy, measuredAt: Date.now() });

test('circle and street zones measure distance to their edge with GPS tolerance', () => {
  const circle = { kind: 'circle', lat: 41, lng: 29, radius: 30 };
  assert.ok(Math.abs(zoneDistance(41 + 50 * M, 29, circle) - 20) < 0.5);
  assert.equal(fixInsideZone(fix(35, 0), circle), true, '5 m outside with 8 m GPS');
  assert.equal(fixInsideZone(fix(60, 0), circle), false);
  assert.equal(fixOutsideZone(fix(60, 0), circle), true);
  assert.equal(fixOutsideZone(fix(35, 0), circle), false, 'uncertain is not clearly outside');
  // A 200 m east-west street, 20 m wide.
  const street = { kind: 'street', points: [{ lat: 41, lng: 29 }, { lat: 41, lng: 29 + 200 * M / Math.cos(41 * Math.PI / 180) }], width: 20 };
  assert.equal(fixInsideZone(fix(5, 100), street), true, 'on the pavement');
  assert.equal(fixInsideZone(fix(15, 100), street), true, '5 m beyond the edge with 8 m GPS');
  assert.equal(fixInsideZone(fix(40, 100), street), false, 'parallel street');
  assert.equal(fixInsideZone(fix(0, 260), street), false, 'past the end');
  const b = zoneBounds(street);
  assert.ok(b.radius > 100 && b.radius < 115);
});

test('schedules use the campaign time zone and may run past midnight', () => {
  const at = iso => Date.parse(iso);
  const evening = { days: [5], start: '18:00', end: '23:00', timezone: 'Europe/Istanbul' }; // Friday
  assert.equal(scheduleAllows(evening, at('2026-10-16T16:30:00Z')), true, 'Fri 19:30 Istanbul');
  assert.equal(scheduleAllows(evening, at('2026-10-16T21:00:00Z')), false, 'Sat 00:00 Istanbul');
  const night = { days: [5], start: '22:00', end: '03:00', timezone: 'Europe/Istanbul' };
  assert.equal(scheduleAllows(night, at('2026-10-16T22:30:00Z')), true, 'Sat 01:30 belongs to Friday night');
  assert.equal(scheduleAllows(night, at('2026-10-17T22:30:00Z')), false, 'Sun 01:30 belongs to Saturday night');
  assert.deepEqual(localTime(at('2026-10-16T21:30:00Z'), 'Europe/Istanbul'), { day: 6, minutes: 30, date: '2026-10-17' });
});

test('frequency, step order and codes', () => {
  const now = Date.now(), hour = 3_600_000;
  assert.equal(frequencyAllows({ kind: 'once' }, undefined, now), true);
  assert.equal(frequencyAllows({ kind: 'once' }, { count: 1, lastAt: now - 100 * hour }, now), false);
  assert.equal(frequencyAllows({ kind: 'hours', hours: 6 }, { count: 1, lastAt: now - 5 * hour }, now), false);
  assert.equal(frequencyAllows({ kind: 'hours', hours: 6 }, { count: 1, lastAt: now - 7 * hour }, now), true);
  assert.equal(frequencyAllows({ kind: 'daily' }, { count: 1, lastAt: now - 30 * hour }, now, 'UTC'), true);
  const step = { id: 's2', requires: 's1', withinMinutes: 360 };
  assert.equal(requirementMet(step, {}, now), false);
  assert.equal(requirementMet(step, { s1: { count: 1, lastAt: now - 2 * hour } }, now), true);
  assert.equal(requirementMet(step, { s1: { count: 1, lastAt: now - 7 * hour } }, now), false, 'expired after 6 h');
  assert.match(makeCode('beer', n => new Uint8Array(n).fill(7)), /^BEER-[A-Z2-9]{6}$/);
});
