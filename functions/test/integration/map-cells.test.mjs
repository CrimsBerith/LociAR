import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newUser } from './_harness.mjs';
import { encodeGeohash } from '../../lib/geo.js';
const { syncMapCell, mapCellPlacement, MAP_CELL_PRECISION } = await import('../../lib/mapCells.js');

after(closeClients);
const flags = adminDb.collection('system').doc('geo_queries');
const meter = 1 / 111320;
// An empty stretch of ocean no other suite uses; a fresh offset per run.
const centre = { lat: 12 + Math.random() * 0.5, lng: -150 + Math.random() * 0.5 };

async function post(creator, offsetMeters, extra = {}) {
  const ref = adminDb.collection('posts').doc(randomUUID());
  const lat = centre.lat + offsetMeters * meter, lng = centre.lng;
  await ref.set({ creator_id: creator.luid, creator_handle: creator.handle, is_anonymous: false, status: 'active', visibility: 'public',
    age_rating: 'all', note_kind: 'location', caption: `note ${offsetMeters}`, likes_count: 0, lat, lng,
    geohash: encodeGeohash(lat, lng, 10), created_at: Timestamp.now(),
    pose_json: JSON.stringify({ latitude: lat, longitude: lng, heading: 0 }),
    edit_data_json: JSON.stringify({ version: 1, layers: [{ id: randomUUID(), type: 'text', text: 'note' }] }), ...extra });
  return ref;
}

/** Waits until the trigger (and its spot follow-ups) left every index entry matching its post. */
async function settled(refs) {
  let stable = 0;
  for (let i = 0; i < 300 && stable < 4; i++) {
    let ok = true;
    for (const ref of refs) {
      await syncMapCell(ref.id);
      const [p, member] = await Promise.all([ref.get(), adminDb.collection('map_cell_members').doc(ref.id).get()]);
      if (JSON.stringify(mapCellPlacement(p.data())?.entry ?? null) !== JSON.stringify(member.get('entry') ?? null)) ok = false;
    }
    stable = ok ? stable + 1 : 0;
    await sleep(500);
  }
  assert.equal(stable >= 4, true, 'index entries settle');
}

/** The same request through the post scan and through the index. */
async function both(viewer, payload) {
  await flags.set({ map_cells_version: FieldValue.delete() }, { merge: true });
  const scan = await viewer.call('readPublicContent', payload);
  await flags.set({ map_cells_version: 1 }, { merge: true });
  const index = await viewer.call('readPublicContent', payload);
  return { scan, index };
}
const nearby = { mode: 'nearby', latitude: centre.lat, longitude: centre.lng, radiusMeters: 1_000 };
const groups = { mode: 'map_groups', latitude: centre.lat, longitude: centre.lng, radiusMeters: 2_000 };
const byText = (a, b) => a.localeCompare(b, 'en');
const groupView = response => response.groups.map(g => `${g.id}:${g.count}:${[...g.post_ids].sort(byText).join(',')}`).sort(byText);
const ids = response => response.posts.map(p => p.id);

test('map opening reads the cell index with the same results, blocks and account fences as the post scan', async () => {
  const prior = (await flags.get()).get('map_cells_version');
  try {
    const [alice, bob, viewer] = await Promise.all([newUser(), newUser(), newUser()]);
    const refs = await Promise.all([
      post(alice, 0), post(alice, 0, { likes_count: 5 }), post(alice, 300, { is_anonymous: true }),
      post(bob, 600), post(bob, 900, { is_anonymous: true }), post(alice, 1_500), post(alice, 2_600),
      post(alice, 450, { age_rating: '18_plus' }), post(alice, 700, { status: 'pending_review' }),
      post(viewer, 800, { visibility: 'private' }), post(viewer, 850, { status: 'flagged' })]);
    await settled(refs);
    const [samePlace, samePlacePopular, aliceAnon, bobOpen, bobAnon, farInGroups, outside, adult, aliceReview, ownPrivate, ownFlagged] = refs;

    const cell = encodeGeohash(centre.lat, centre.lng, MAP_CELL_PRECISION);
    const indexed = (await adminDb.collection('map_cells').doc(cell).get()).get('posts');
    assert.ok(indexed[samePlace.id], 'public posts are indexed');
    for (const hidden of [adult, aliceReview, ownPrivate]) assert.equal((await adminDb.collection('map_cell_members').doc(hidden.id).get()).exists, false);

    let { scan, index } = await both(viewer, nearby);
    assert.deepEqual(ids(index), ids(scan));
    assert.equal(index.total, scan.total);
    assert.deepEqual(ids(index).slice(0, 2), [samePlacePopular.id, samePlace.id], 'popularity orders notes at one place');
    for (const own of [ownPrivate, ownFlagged]) assert.ok(ids(index).includes(own.id), 'the viewer still sees their own unlisted posts');
    for (const hidden of [adult, aliceReview, farInGroups, outside]) assert.equal(ids(index).includes(hidden.id), false);

    ({ scan, index } = await both(viewer, groups));
    assert.deepEqual(groupView(index), groupView(scan));
    assert.equal(index.summaryVersion, 1);
    assert.equal(index.complete, true);
    assert.deepEqual(index.coverage, { latitude: centre.lat, longitude: centre.lng, radiusMeters: 2_000 });
    assert.deepEqual(index.coverage, scan.coverage);
    const grouped = index.groups.flatMap(g => g.post_ids);
    assert.ok(grouped.includes(farInGroups.id));
    for (const hidden of [outside, adult, aliceReview, ownPrivate, ownFlagged]) assert.equal(grouped.includes(hidden.id), false);

    // A profile block hides Bob's attributed posts; muting anonymous notes hides only Alice's anonymous one.
    await adminDb.collection('user_blocks').doc(`${viewer.luid}_${bob.luid}`).set({ blocker_id: viewer.luid, blocked_id: bob.luid, created_at: Timestamp.now() });
    await adminDb.collection('anonymous_blocks').doc(`${viewer.luid}_${alice.luid}`).set({ blocker_id: viewer.luid, blocked_id: alice.luid, created_at: Timestamp.now() });
    for (const payload of [nearby, groups]) {
      ({ scan, index } = await both(viewer, payload));
      if (payload === nearby) assert.deepEqual(ids(index), ids(scan)); else assert.deepEqual(groupView(index), groupView(scan));
    }
    const blockedView = ids(await viewer.call('readPublicContent', nearby));
    assert.equal(blockedView.includes(bobOpen.id), false);
    assert.equal(blockedView.includes(aliceAnon.id), false);
    assert.equal(blockedView.includes(bobAnon.id), true, 'a profile block never reveals or hides anonymous authorship');

    // Suspended authors disappear from both surfaces at once.
    await adminDb.collection('profiles').doc(alice.luid).update({ suspended: true });
    for (const payload of [nearby, groups]) {
      ({ scan, index } = await both(viewer, payload));
      if (payload === nearby) assert.deepEqual(ids(index), ids(scan)); else assert.deepEqual(groupView(index), groupView(scan));
    }
    assert.equal(ids(await viewer.call('readPublicContent', nearby)).includes(samePlace.id), false);
    await adminDb.collection('profiles').doc(alice.luid).update({ suspended: FieldValue.delete() });

    // The index is what map groups read; nearby bodies are re-read live, so a stale entry never returns a post.
    const ghost = randomUUID();
    await adminDb.collection('map_cells').doc(cell).set({ posts: { [ghost]: [centre.lat, centre.lng, alice.luid, 0, ''] } }, { merge: true });
    assert.ok((await viewer.call('readPublicContent', groups)).groups.some(g => g.post_ids.includes(ghost)));
    assert.equal(ids(await viewer.call('readPublicContent', nearby)).includes(ghost), false);
    await adminDb.collection('map_cells').doc(cell).update({ [`posts.${ghost}`]: FieldValue.delete() });

    // Removal and moves keep the index and its count exact, including redelivered syncs.
    const before = Number((await adminDb.collection('map_cells').doc(cell).get()).get('count'));
    await samePlace.update({ status: 'removed' });
    await syncMapCell(samePlace.id); await syncMapCell(samePlace.id);
    let snapshot = await adminDb.collection('map_cells').doc(cell).get();
    assert.equal(snapshot.get(`posts.${samePlace.id}`), undefined);
    assert.equal(snapshot.get('count'), before - 1);
    assert.equal((await adminDb.collection('map_cell_members').doc(samePlace.id).get()).exists, false);
    const moved = { lat: centre.lat + 5_000 * meter, lng: centre.lng };
    await samePlacePopular.update({ ...moved, geohash: encodeGeohash(moved.lat, moved.lng, 10) });
    await syncMapCell(samePlacePopular.id);
    const target = encodeGeohash(moved.lat, moved.lng, MAP_CELL_PRECISION);
    assert.notEqual(target, cell);
    assert.equal((await adminDb.collection('map_cells').doc(cell).get()).get(`posts.${samePlacePopular.id}`), undefined);
    assert.ok((await adminDb.collection('map_cells').doc(target).get()).get(`posts.${samePlacePopular.id}`));
    snapshot = await adminDb.collection('map_cells').doc(cell).get();
    assert.equal(snapshot.get('count'), before - 2);
  } finally {
    await flags.set({ map_cells_version: prior ?? FieldValue.delete() }, { merge: true });
  }
});
