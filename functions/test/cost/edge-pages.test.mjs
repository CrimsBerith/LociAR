import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
process.env.FUNCTIONS_EMULATOR = 'true';
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
const { readPublicContent } = await import('../../lib/publicContent.js');
const { syncMapCell } = await import('../../lib/mapCells.js');
after(async () => { await deleteApp(getApp()); });

async function viewer() {
  const uid = randomUUID(), luid = luidForUid(uid);
  await db.collection('profiles').doc(luid).set({ created_at: Timestamp.now() });
  const call = data => readPublicContent.run({ auth: { uid, token: { email_verified: true, firebase: { sign_in_provider: 'password' } } }, data });
  return { luid, call };
}
async function post(author, extra = {}, id = randomUUID()) {
  await db.collection('posts').doc(id).set({ creator_id: author, status: 'active', visibility: 'public',
    created_at: Timestamp.now(), age_rating: 'all', caption: 'synthetic', ...extra });
  return id;
}

test('saved posts use bounded raw pages; a deleted cursor edge and another viewer cannot corrupt pagination', async () => {
  const v = await viewer(), other = await viewer(), ids = Array.from({ length: 21 }, () => randomUUID()).sort();
  for (const id of ids) {
    await post(v.luid, {}, id);
    await db.collection('post_saves').doc(`${v.luid}_${id}`).set({ user_id: v.luid, post_id: id });
  }
  const first = await v.call({ mode: 'saved' });
  assert.equal(first.edgePageVersion, 1); assert.deepEqual(first.posts.map(p => p.id), ids.slice(0, 15)); assert.ok(first.next);
  await db.collection('post_saves').doc(`${v.luid}_${ids[14]}`).delete();
  const second = await v.call({ mode: 'saved', cursor: first.next });
  assert.deepEqual(second.posts.map(p => p.id), ids.slice(15)); assert.equal(second.next, null);
  await assert.rejects(other.call({ mode: 'saved', cursor: first.next }), error => error.code === 'invalid-argument');
});

test('an entirely removed collection page advances; ownership and cursor scope remain enforced', async () => {
  const v = await viewer(), other = await viewer(), collection = db.collection('collections').doc(randomUUID());
  await collection.set({ owner_id: v.luid });
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const id = await post(v.luid, { status: i < 15 ? 'removed' : 'active' }); ids.push(id);
    await db.collection('collection_items').doc(`${collection.id}_${id}`).set({ owner_id: v.luid, collection_id: collection.id, post_id: id, sort_order: i });
  }
  const first = await v.call({ mode: 'collection', collectionId: collection.id });
  assert.deepEqual(first.posts, []); assert.ok(first.next, 'hidden raw rows cannot terminate the list');
  const next = await v.call({ mode: 'collection', collectionId: collection.id, cursor: first.next });
  assert.deepEqual(next.posts.map(p => p.id), ids.slice(15)); assert.equal(next.next, null);
  const foreign = await other.call({ mode: 'collection', collectionId: collection.id });
  assert.deepEqual(foreign, { posts: [], next: null, edgePageVersion: 1 });
  await assert.rejects(v.call({ mode: 'saved', cursor: first.next }), error => error.code === 'invalid-argument');
});

test('saved projections preserve independent anonymous blocks and remote note redaction', async () => {
  const v = await viewer(), author = await viewer();
  const anon = await post(author.luid, { is_anonymous: true, note_kind: 'location', lat: 42, lng: 27, notify_radius_m: 20, caption: 'secret on-site text' });
  const attributed = await post(author.luid);
  for (const id of [anon, attributed]) await db.collection('post_saves').doc(`${v.luid}_${id}`).set({ user_id: v.luid, post_id: id });
  const initial = await v.call({ mode: 'saved' });
  const locked = initial.posts.find(p => p.id === anon);
  assert.ok(locked.locked); assert.equal(locked.caption, ''); assert.equal(JSON.stringify(locked).includes('secret on-site text'), false);
  await db.collection('user_blocks').doc(`${v.luid}_${author.luid}`).set({ blocker_id: v.luid, blocked_id: author.luid });
  const profileBlocked = await v.call({ mode: 'saved' });
  assert.deepEqual(profileBlocked.posts.map(p => p.id), [anon], 'profile block never unmasks anonymous authorship');
  await db.collection('user_blocks').doc(`${v.luid}_${author.luid}`).delete();
  await db.collection('anonymous_blocks').doc(`${v.luid}_${author.luid}`).set({ blocker_id: v.luid, blocked_id: author.luid });
  const muted = await v.call({ mode: 'saved' });
  assert.deepEqual(muted.posts.map(p => p.id), [attributed]);
});

test('AR includes nearby own pending content beyond the public page and excludes distant own posts', async () => {
  const v = await viewer(), author = await viewer(), lat = -41, lng = 37;
  const indexedPosts = [];
  for (let i = 0; i < 101; i++) indexedPosts.push(await post(author.luid, { lat, lng }));
  const own = await post(v.luid, { lat: lat + 0.0009, lng, status: 'pending_review' });
  const ownPublic = await post(v.luid, { lat: lat + 0.001, lng });
  const far = await post(v.luid, { lat: lat + 0.1, lng });
  const base = { mode: 'nearby', latitude: lat, longitude: lng, radiusMeters: 120 };
  for (const id of [...indexedPosts, own, ownPublic, far]) await syncMapCell(id);
  const flags = db.collection('system').doc('geo_queries');
  const prior = (await flags.get()).get('map_cells_version');
  try {
    for (const version of [0, 1]) {
      await flags.set({ map_cells_version: version }, { merge: true });
      const legacy = await v.call(base);
      assert.equal(legacy.posts.length, 100); assert.equal(legacy.posts.some(p => p.id === own), false);
      const ar = await v.call({ ...base, includeOwnNearby: true });
      assert.equal(ar.posts.some(p => p.id === own), true);
      assert.equal(ar.posts.some(p => p.id === ownPublic), true);
      assert.equal(ar.posts.some(p => p.id === far), false);
      assert.equal(ar.posts.length, 102, `scan/index ${version} retains both nearby own posts`);
    }
  } finally {
    await flags.set({ map_cells_version: prior ?? 0 }, { merge: true });
  }
});
