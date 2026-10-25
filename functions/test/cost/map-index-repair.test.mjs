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
