import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db } = await import('../../lib/core.js');
const { runAccountDeletion } = await import('../../lib/accountDeletion.js');
const { repairSpotCount } = await import('../../lib/denseSpots.js');
after(async () => { await deleteApp(getApp()); });

async function fixture(count = 6) {
  const owner = randomUUID(), spot = db.collection('note_spots').doc(randomUUID());
  const job = db.collection('account_deletion_jobs').doc(owner);
  await job.set({ uid: 'synthetic-' + owner, status: 'pending', stage: 'firestore' });
  await spot.set({ count: 99 });
  for (let i = 0; i < count; i++) {
    const post = db.collection('posts').doc(randomUUID());
    await post.set({ creator_id: owner, spot_id: spot.id, status: 'active', visibility: 'public' });
    await db.collection('note_spot_members').doc(post.id).set({ post_id: post.id, spot_id: spot.id, owner_luid: owner });
  }
  await db.collection('posts').doc(randomUUID()).set({ creator_id: randomUUID(), spot_id: spot.id, status: 'active', visibility: 'public' });
  return { owner, spot, job };
}
const noExternal = { deleteStorage: async () => 0, deleteAuthUser: async () => {} };

test('hard deletion repairs a shared spot once per batch and persists pending work across a crash', async () => {
  const f = await fixture(); let attempts = 0;
  await assert.rejects(runAccountDeletion(f.owner, { ...noExternal, repairSpotCount: async () => {
    attempts++; throw new Error('synthetic repair outage');
  } }), /repair outage/);
  assert.equal(attempts, 1, 'six posts do not perform six independent recounts');
  assert.equal((await db.collection('posts').where('creator_id', '==', f.owner).get()).size, 0);
  assert.equal((await db.collection('note_spot_members').where('owner_luid', '==', f.owner).get()).size, 0);
  assert.deepEqual((await f.job.get()).get('repair_spot_ids'), [f.spot.id]);
  assert.equal(await runAccountDeletion(f.owner, { ...noExternal, repairSpotCount: async id => {
    attempts++; await repairSpotCount(id);
  } }), 'done');
  assert.equal(attempts, 2); assert.equal((await f.spot.get()).get('count'), 1);
  assert.deepEqual((await f.job.get()).get('repair_spot_ids'), []);
});

test('a completed Auth phase resumes with only the final Storage sweep after a crash', async t => {
  const f = await fixture(0);
  await assert.rejects(runAccountDeletion(f.owner, { ...noExternal, deleteAuthUser: async () => { throw new Error('synthetic Auth outage'); } }), /Auth outage/);
  assert.equal((await f.job.get()).get('stage'), 'auth');
  const collection = db.collection.bind(db); let postQueries = 0, sweeps = 0;
  t.mock.method(db, 'collection', name => { if (name === 'posts') postQueries++; return collection(name); });
  assert.equal(await runAccountDeletion(f.owner, { ...noExternal, deleteStorage: async () => { sweeps++; return 0; } }), 'done');
  assert.equal(postQueries, 0); assert.equal(sweeps, 1, 'the post-Auth late upload sweep always remains');
});
