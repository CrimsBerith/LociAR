import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db } = await import('../../lib/core.js');
const { syncMapCell, reconcileMapCells, mapCellPlacement } = await import('../../lib/mapCells.js');
after(async () => deleteApp(getApp()));

test('bounded member reconciliation repairs a missed delete and advances past a deleted member cursor', async () => {
  const orphan = '00000000-0000-4000-8000-000000000001', retained = '00000000-0000-4000-8000-000000000002';
  const data = { creator_id: '00000000-0000-4000-8000-000000000003', status: 'active', visibility: 'public', age_rating: 'all', lat: -69, lng: 150 };
  for (const id of [orphan, retained]) { await db.collection('posts').doc(id).set(data); await syncMapCell(id); }
  const cell = db.collection('map_cells').doc(mapCellPlacement(data).cell);
  await db.collection('posts').doc(orphan).delete(); // Firestore-only suite deliberately has no trigger worker.
  const state = db.collection('system').doc('map_cells_reconcile');
  await state.set({ cursor: null, member_cursor: null });
  const first = await reconcileMapCells(1);
  assert.equal(first.membersChecked, 1);
  assert.equal((await db.collection('map_cell_members').doc(orphan).get()).exists, false);
  assert.equal((await cell.get()).get(`posts.${orphan}`), undefined);
  assert.equal((await state.get()).get('member_cursor'), orphan);
  await reconcileMapCells(1);
  assert.equal((await db.collection('map_cell_members').doc(retained).get()).exists, true);
  assert.ok((await cell.get()).get(`posts.${retained}`));
  await syncMapCell(orphan);
  assert.equal((await cell.get()).get('count'), 1, 'replay cannot decrement the removed member twice');
});

test('a version-1 index restarts its pass and readers wait until location notes carry their marker', async () => {
  const { MAP_CELLS_VERSION, mapCellsEnabled, _test } = await import('../../lib/mapCells.js');
  const id = '00000000-0000-4000-8000-000000000011';
  const data = { creator_id: '00000000-0000-4000-8000-000000000012', status: 'active', visibility: 'public', age_rating: 'all',
    note_kind: 'location', lat: -68, lng: 151 };
  await db.collection('posts').doc(id).set(data);
  const placement = mapCellPlacement(data);
  const legacy = placement.entry.slice(0, 5); // what version 1 wrote for a location note
  await db.collection('map_cells').doc(placement.cell).set({ cell: placement.cell, posts: { [id]: legacy }, count: 1 });
  await db.collection('map_cell_members').doc(id).set({ cell: placement.cell, entry: legacy, overflow: false });
  const state = db.collection('system').doc('map_cells_reconcile');
  const flags = db.collection('system').doc('geo_queries');
  await state.set({ cursor: 'zzzz', member_cursor: 'zzzz', last_full_pass_at: new Date(), last_member_pass_at: new Date() });
  await flags.set({ map_cells_version: 1 });
  _test.resetFlagCache();
  assert.equal(await mapCellsEnabled(), false, 'a version-1 index is not used');
  await reconcileMapCells(1_000);
  assert.deepEqual((await db.collection('map_cells').doc(placement.cell).get()).get(`posts.${id}`), placement.entry);
  assert.equal((await flags.get()).get('map_cells_version'), MAP_CELLS_VERSION);
  assert.equal((await state.get()).get('pass_version'), MAP_CELLS_VERSION);
  _test.resetFlagCache();
  assert.equal(await mapCellsEnabled(), true);
});
