import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNoteGroups } from '../lib/mapNoteGroups.js';

test('ten notes at the same place form one exact group, not ten map pins', () => {
  const posts = Array.from({ length: 10 }, (_, i) => ({ id: `note-${i}`, spotId: 'place', lat: 41, lng: 29 }));
  const groups = mapNoteGroups(posts);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 10);
  assert.equal(groups[0].radius, 0);
  assert.equal(groups[0].lat, 41);
  assert.deepEqual(mapNoteGroups(posts.toReversed()), groups, 'input order does not move or rename a group');
});

test('nearby small groups remain distinct even inside the same broad heat cell', () => {
  const groups = mapNoteGroups([
    { id: 'a', lat: 41, lng: 29 }, { id: 'b', lat: 41, lng: 29 },
    { id: 'c', lat: 41.0005, lng: 29 }, { id: 'd', lat: 41.0005, lng: 29 },
  ]);
  assert.deepEqual(groups.map(g => g.count), [2, 2]);
  assert.deepEqual(groups.map(g => g.id), ['post:a', 'post:c']);
});

test('server spot identities stay separate and report every member', () => {
  const groups = mapNoteGroups([
    { id: 'a', spotId: 'one', lat: 41, lng: 29 },
    { id: 'b', spotId: 'one', lat: 41.00004, lng: 29 },
    { id: 'c', spotId: 'two', lat: 41, lng: 29 },
  ]);
  assert.equal(groups[0].id, 'spot:one');
  assert.equal(groups[0].lat, 41.00002);
  assert.ok(groups[0].radius > 2 && groups[0].radius < 3);
  assert.deepEqual(groups[0].post_ids, ['a', 'b']);
});

test('fallback and persistent groups keep antimeridian neighbours beside the date line', () => {
  for (const spotId of [undefined, 'place']) {
    const [group] = mapNoteGroups([{ id: 'a', lat: 0, lng: 179.99998, spotId }, { id: 'b', lat: 0, lng: -179.99998, spotId }]);
    assert.equal(group.count, 2);
    assert.ok(Math.abs(group.lng) > 179.9999);
    assert.ok(group.radius > 2 && group.radius < 3);
  }
});
