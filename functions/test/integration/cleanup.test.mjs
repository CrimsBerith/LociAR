import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients } from './_harness.mjs';
// Runs the cleanup logic in-process against the emulators (the harness initialises firebase-admin).
import { purgeDueRemovedMedia, purgeOrphanUploads, schedulePurgeOnStatusChange } from '../../lib/cleanup.js';
import { orphanUploadIO } from '../../lib/orphanUploadStorage.js';
import { resumeOrphanUploadReclamations } from '../../lib/orphanUploads.js';

after(closeClients);
const bucket = () => getStorage().bucket();
const DAY = 86_400_000;

async function waitForQueueEntry(postId) {
  for (let i = 0; i < 100; i++) {
    if ((await adminDb.collection('media_purge_queue').doc(postId).get()).exists) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`onPostWritten never queued ${postId}`);
}

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
  // The emulated onPostWritten trigger queues these posts too (due in 30 days). Wait for it so it
  // cannot overwrite the back-dated entries written below.
  for (const id of [oldPost, freshPost, restoredPost]) await waitForQueueEntry(id);
  const now = Date.now();
  await schedulePurgeOnStatusChange(oldPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 31 * DAY);
  await schedulePurgeOnStatusChange(freshPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 1 * DAY);
  await schedulePurgeOnStatusChange(restoredPost, { status: 'active' }, { status: 'removed', creator_id: luid }, now - 31 * DAY);
  await adminDb.collection('posts').doc(restoredPost).update({ status: 'pending_review' });
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
  assert.equal((await adminDb.collection('storage_reclamations').doc(orphan).get()).get('state'), 'reclaimed');
  assert.equal((await adminDb.collection('storage_reclamation_queue').doc(orphan).get()).exists, false);
});

test('orphan reclamation resumes durable validation and deletion after a small page budget', async () => {
  const luid = randomUUID();
  const postId = randomUUID();
  const paths = ['a', 'b', 'c'].map((file) => `post-world-maps/${luid}/${postId}/${file}.lociarmap`);
  for (const path of paths) await upload(path);
  const now = Date.now() + 3 * DAY;
  const io = orphanUploadIO(now);
  await io.claim(`${luid}/${postId}/`, now - 2 * DAY);
  const first = await io.list(`post-world-maps/${luid}/${postId}/`, null, 1);
  assert.equal(first.files.length, 1);
  assert.equal(first.hasMore, true);
  assert.ok(first.files[0].generation, 'the Storage adapter retains generation preconditions');
  await resumeOrphanUploadReclamations(io, { maxPages: 1, pageSize: 1 });
  const queued = (await adminDb.collection('storage_reclamation_queue').doc(postId).get()).data();
  assert.equal(queued.phase, 'validating');
  assert.ok(queued.last_name);
  for (const path of paths) assert.equal(await exists(path), true, 'all files survive incomplete validation');
  for (let run = 0; run < 10 && (await adminDb.collection('storage_reclamation_queue').doc(postId).get()).exists; run++) {
    await resumeOrphanUploadReclamations(orphanUploadIO(now), { maxPages: 3, pageSize: 1 });
  }
  for (const path of paths) assert.equal(await exists(path), false);
  assert.equal((await adminDb.collection('storage_reclamation_queue').doc(postId).get()).exists, false);
  assert.equal((await adminDb.collection('storage_reclamations').doc(postId).get()).get('state'), 'reclaimed');
});

test('transactional orphan claim refuses an existing post and validation cancels a fresh draft', async () => {
  const luid = randomUUID();
  const [owned, fresh] = [randomUUID(), randomUUID()];
  await adminDb.collection('posts').doc(owned).set({ creator_id: luid, status: 'pending_review' });
  const ownedPath = `post-world-maps/${luid}/${owned}/a.lociarmap`;
  const freshPath = `post-world-maps/${luid}/${fresh}/a.lociarmap`;
  await upload(ownedPath); await upload(freshPath);
  const io = orphanUploadIO();
  await io.claim(`${luid}/${owned}/`, Date.now() + DAY);
  assert.equal((await adminDb.collection('storage_reclamations').doc(owned).get()).get('state'), 'committed');
  // Represents an upload completed just before a candidate was claimed from an earlier scan.
  await io.claim(`${luid}/${fresh}/`, Date.now() - 2 * DAY);
  await resumeOrphanUploadReclamations(io);
  assert.equal(await exists(ownedPath), true);
  assert.equal(await exists(freshPath), true);
  assert.equal((await adminDb.collection('storage_reclamations').doc(fresh).get()).exists, false);
  assert.equal((await adminDb.collection('storage_reclamation_queue').doc(fresh).get()).exists, false);

  const deletingLuid = randomUUID();
  const lateDraft = randomUUID();
  await adminDb.collection('account_deletion_jobs').doc(deletingLuid).set({ status: 'done' });
  await io.claim(`${deletingLuid}/${lateDraft}/`, Date.now() + DAY);
  assert.equal((await adminDb.collection('storage_reclamations').doc(lateDraft).get()).exists, false,
    'a stale listing cannot recreate cleanup records after account deletion');
  assert.equal((await adminDb.collection('storage_reclamation_queue').doc(lateDraft).get()).exists, false);

  const inFlightLuid = randomUUID();
  const inFlightPost = randomUUID();
  await io.claim(`${inFlightLuid}/${inFlightPost}/`, Date.now() + DAY);
  const inFlightJob = (await io.queued(5)).find((job) => job.post_id === inFlightPost);
  assert.ok(inFlightJob);
  await adminDb.collection('account_deletion_jobs').doc(inFlightLuid).set({ status: 'done' });
  await adminDb.collection('storage_reclamations').doc(inFlightPost).delete(); // Account cascade already passed claims.
  await io.complete(inFlightJob);
  assert.equal((await adminDb.collection('storage_reclamations').doc(inFlightPost).get()).exists, false,
    'a completion cannot recreate its marker after the account cascade passed claims');
  assert.equal((await adminDb.collection('storage_reclamation_queue').doc(inFlightPost).get()).exists, false);
});

test('removed-media queue follows current status and deletion jobs rather than delayed trigger payloads', async () => {
  const luid = randomUUID();
  const postId = randomUUID();
  const ref = adminDb.collection('posts').doc(postId);
  const queue = adminDb.collection('media_purge_queue').doc(postId);
  await adminDb.collection('profiles').doc(luid).set({ deleted_at: null });
  await ref.set({ creator_id: luid, status: 'pending_review' });
  await queue.set({ post_id: postId, prefix: `${luid}/${postId}/`, due_at: Timestamp.fromMillis(1) });
  await schedulePurgeOnStatusChange(postId, { status: 'active' }, { status: 'removed', creator_id: luid });
  assert.equal((await queue.get()).exists, false, 'late removed event cannot requeue a restored post');

  await ref.update({ status: 'removed' });
  const deadline = Date.now() - DAY;
  await queue.set({ post_id: postId, prefix: `${luid}/${postId}/`, due_at: Timestamp.fromMillis(deadline) });
  await schedulePurgeOnStatusChange(postId, { status: 'removed' }, { status: 'pending_review', creator_id: luid });
  assert.equal((await queue.get()).exists, true, 'late restore event cannot cancel the current removal');
  assert.equal((await queue.get()).get('due_at').toMillis(), deadline);
  await schedulePurgeOnStatusChange(postId, { status: 'active' }, { status: 'removed', creator_id: luid }, Date.now() + DAY);
  assert.equal((await queue.get()).get('due_at').toMillis(), deadline, 'redelivery does not restart the grace period');

  await adminDb.collection('account_deletion_jobs').doc(luid).set({ status: 'done' });
  await schedulePurgeOnStatusChange(postId, undefined, { status: 'removed', creator_id: luid });
  assert.equal((await queue.get()).exists, false, 'account deletion prevents a delayed event from recreating its queue');
});
