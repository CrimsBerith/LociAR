import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients } from './_harness.mjs';
// Runs the cleanup logic in-process against the emulators (the harness initialises firebase-admin).
import { purgeDueRemovedMedia, purgeOrphanUploads, schedulePurgeOnStatusChange } from '../../lib/cleanup.js';

after(closeClients);
const bucket = () => getStorage().bucket();
const DAY = 86_400_000;

async function upload(path) {
  await bucket().file(path).save(Buffer.from('lociarmap-test-bytes'), { contentType: 'application/x-lociarmap' });
}
const exists = async (path) => (await bucket().file(path).exists())[0];

test('removed posts keep media during the grace period, then it is purged; restore cancels', async () => {
  const luid = randomUUID();
  const [oldPost, freshPost, restoredPost] = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of [oldPost, freshPost, restoredPost]) {
    await adminDb.collection('posts').doc(id).set({ creator_id: luid, status: 'removed' });
    await upload(`post-world-maps/${luid}/${id}/a.lociarmap`);
  }
  const now = Date.now();
  await schedulePurgeOnStatusChange(oldPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 31 * DAY);
  await schedulePurgeOnStatusChange(freshPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 1 * DAY);
  await schedulePurgeOnStatusChange(restoredPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 31 * DAY);
  await schedulePurgeOnStatusChange(restoredPost, { status: 'removed' }, { status: 'pending_review', creator_id: luid }, now);

  await purgeDueRemovedMedia(now);

  assert.equal(await exists(`post-world-maps/${luid}/${oldPost}/a.lociarmap`), false);
  assert.ok((await adminDb.collection('posts').doc(oldPost).get()).data().media_purged_at);
  assert.equal(await exists(`post-world-maps/${luid}/${freshPost}/a.lociarmap`), true, 'within 30 days');
  assert.equal(await exists(`post-world-maps/${luid}/${restoredPost}/a.lociarmap`), true, 'restored post keeps its map');
});

test('orphan world maps without a post are removed only after the grace period', async () => {
  const luid = randomUUID();
  const [orphan, owned] = [randomUUID(), randomUUID()];
  await upload(`post-world-maps/${luid}/${orphan}/a.lociarmap`);
  await upload(`post-world-maps/${luid}/${owned}/a.lociarmap`);
  await adminDb.collection('posts').doc(owned).set({ creator_id: luid, status: 'active', updated_at: Timestamp.now() });

  await purgeOrphanUploads(Date.now()); // too recent: nothing deleted
  assert.equal(await exists(`post-world-maps/${luid}/${orphan}/a.lociarmap`), true);

  await purgeOrphanUploads(Date.now() + 3 * DAY); // pretend two+ days have passed
  assert.equal(await exists(`post-world-maps/${luid}/${orphan}/a.lociarmap`), false);
  assert.equal(await exists(`post-world-maps/${luid}/${owned}/a.lociarmap`), true);
});
