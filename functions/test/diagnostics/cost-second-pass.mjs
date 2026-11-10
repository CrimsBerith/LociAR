/** Baseline diagnostics, not acceptance tests: passing reproduces a remaining cost/geometry issue.
 * Run explicitly with node --test --test-concurrency=1 against a disposable demo emulator.
 * No production behavior is changed by this file. All content and identities are synthetic.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-lociar');
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
assert.equal(db.projectId, 'demo-lociar');
const { readPublicContent } = await import('../../lib/publicContent.js');
const { syncSpotMembership } = await import('../../lib/denseSpots.js');
const { applyCountersOnce } = await import('../../lib/counters.js');
const { autoApproveNote } = await import('../../lib/noteAutomation.js');
const { runAccountDeletion } = await import('../../lib/accountDeletion.js');
const { distanceMeters, encodeGeohash } = await import('../../lib/geo.js');
const { MAX_SPOT_RADIUS_M, SPOT_JOIN_RADIUS_M } = await import('../../lib/placeNoteRules.js');
after(async () => { await deleteApp(getApp()); });

async function viewer() {
  const uid = randomUUID(), luid = luidForUid(uid);
  await db.collection('profiles').doc(luid).set({ created_at: Timestamp.now() });
  return { luid, call: data => readPublicContent.run({ auth: { uid, token: {
    email_verified: true, firebase: { sign_in_provider: 'password' },
  } }, data }) };
}
async function post(owner, data = {}) {
  const ref = db.collection('posts').doc(randomUUID());
  await ref.set({ creator_id: owner, status: 'active', visibility: 'public', age_rating: 'all',
    caption: 'Synthetic audit note', created_at: Timestamp.now(), ...data });
  return ref;
}
async function blocks(owner) {
  const batch = db.batch();
  for (let i = 0; i < 400; i++) {
    const other = randomUUID(), outgoing = i < 200;
    const collection = i < 300 ? 'user_blocks' : 'anonymous_blocks';
    const blocker = i < 300 && !outgoing ? other : owner;
    const blocked = blocker === owner ? other : owner;
    batch.set(db.collection(collection).doc(`${blocker}_${blocked}`), { blocker_id: blocker, blocked_id: blocked });
  }
  await batch.commit();
}

function countIO(t) {
  const io = { pointReads: 0, queryCalls: 0, queryRows: 0, postRows: 0, emptyQueries: 0, sessionQueries: 0, updates: 0, creates: 0 };
  const queryPrototype = Object.getPrototypeOf(db.collection('_audit').where('a', '==', true));
  const get = queryPrototype.get;
  function queryResult(result, query) {
    io.queryCalls++; io.queryRows += result.size;
    if (result.empty) io.emptyQueries++;
    if (query?._queryOptions?.collectionId === 'map_group_sessions') io.sessionQueries++;
    io.postRows += result.docs.filter(doc => doc.ref.parent.id === 'posts').length;
    return result;
  }
  t.mock.method(queryPrototype, 'get', async function (...args) { return queryResult(await get.apply(this, args), this); });
  const getAll = db.getAll.bind(db);
  t.mock.method(db, 'getAll', async (...refs) => { io.pointReads += refs.length; return getAll(...refs); });
  const run = db.runTransaction.bind(db);
  t.mock.method(db, 'runTransaction', (operation, ...options) => run(async tx => operation(new Proxy(tx, {
    get(target, key) {
      if (key === 'get') return async ref => {
        const result = await target.get(ref);
        if (Array.isArray(result.docs)) queryResult(result, ref);
        else if (typeof ref.path === 'string') io.pointReads++;
        return result;
      };
      if (key === 'getAll') return async (...refs) => { io.pointReads += refs.length; return target.getAll(...refs); };
      if (key === 'update') return (...args) => { io.updates++; return target.update(...args); };
      if (key === 'create') return (...args) => { io.creates++; return target.create(...args); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    },
  })), ...options));
  return io;
}

test('baseline: a rejected invalid mode still hydrates all 400 unrelated block edges', async t => {
  const v = await viewer(); await blocks(v.luid);
  const io = countIO(t);
  await assert.rejects(v.call({ mode: 'invalid-audit-mode' }), error => error.code === 'invalid-argument');
  assert.equal(io.queryCalls, 3); assert.equal(io.queryRows, 400); assert.equal(io.pointReads, 2);
  t.diagnostic(JSON.stringify({ scenario: 'invalid_mode', ...io }));
});

test('baseline: a 15-row own saved page also fetches the entire unrelated block history', async t => {
  const v = await viewer(); await blocks(v.luid);
  const batch = db.batch();
  for (let i = 0; i < 15; i++) {
    const p = await post(v.luid);
    batch.set(db.collection('post_saves').doc(`${v.luid}_${p.id}`), { user_id: v.luid, post_id: p.id });
  }
  await batch.commit();
  const io = countIO(t), result = await v.call({ mode: 'saved' });
  assert.equal(result.posts.length, 15); assert.equal(io.queryRows, 415); assert.equal(io.pointReads, 19);
  t.diagnostic(JSON.stringify({ scenario: 'own_saved_15_with_400_blocks', ...io }));
});

test('baseline: 15+50 map group pages each scan 300 posts and repeat every member ID in the payload', async t => {
  const v = await viewer(), spot = randomUUID(), batch = db.batch();
  const point = { lat: 41.123, lng: 29.123 };
  await db.collection('note_spots').doc(spot).set({ ...point, radius: 0, count: 300 });
  for (let i = 0; i < 300; i++) batch.set(db.collection('posts').doc(randomUUID()), {
    creator_id: v.luid, status: 'active', visibility: 'public', age_rating: 'all',
    note_kind: 'location', caption: 'Synthetic audit note', created_at: Timestamp.now(), spot_id: spot, ...point,
  });
  await batch.commit();
  const io = countIO(t);
  const first = await v.call({ mode: 'map_group', groupId: `spot:${spot}`, pageSize: 15 });
  const firstIO = { ...io };
  const second = await v.call({ mode: 'map_group', groupId: `spot:${spot}`, pageSize: 50,
    pageToken: first.pageToken, offset: first.nextOffset });
  assert.equal(first.posts.length, 15); assert.equal(second.posts.length, 50); assert.equal(io.postRows, 600);
  assert.equal(first.group.post_ids.length, 300); assert.equal(second.group.post_ids.length, 300);
  t.diagnostic(JSON.stringify({ scenario: 'map_group_300_first15_next50', first: firstIO, total: io,
    firstResponseBytes: Buffer.byteLength(JSON.stringify(first)), secondResponseBytes: Buffer.byteLength(JSON.stringify(second)),
    eachGroupMemberArrayBytes: Buffer.byteLength(JSON.stringify(first.group.post_ids)) }));
});

test('baseline: fallback nearby scans an entire latitude band for one local match', async t => {
  const v = await viewer(), lat = -51.123, lng = 29.123;
  await db.collection('system').doc('geo_queries').set({ geohash_index_version: 0 });
  for (let i = 0; i < 80; i++) {
    const b = i === 0 ? lng : 60 + i;
    await post(v.luid, { lat, lng: b, geohash: encodeGeohash(lat, b, 9) });
  }
  const io = countIO(t), input = { mode: 'nearby', latitude: lat, longitude: lng, radiusMeters: 120 };
  assert.equal((await v.call(input)).posts.length, 1); assert.equal(io.postRows, 80);
  const fallback = { ...io };
  await db.collection('system').doc('geo_queries').set({ geohash_index_version: 1 });
  const before = io.postRows;
  assert.equal((await v.call(input)).posts.length, 1); assert.equal(io.postRows - before, 1);
  t.diagnostic(JSON.stringify({ scenario: 'nearby_80_same_latitude', fallback, indexedPostRows: io.postRows - before,
    note: 'emulator does not prove live composite index readiness or index-entry billing' }));
  await db.collection('system').doc('geo_queries').delete();
});

test('baseline: joining by circle edge grows one nominal 25m group well beyond its capped radius', async t => {
  const owner = await viewer(), reader = await viewer();
  const origin = -35.123, lng = 139.123, degreesPerMeter = 180 / Math.PI / 6_371_008.8;
  const posts = [];
  for (const meters of [-20, -10, 0, 10, 20]) {
    const lat = origin + meters * degreesPerMeter;
    posts.push(await post(owner.luid, { lat, lng, geohash: encodeGeohash(lat, lng, 9), note_kind: 'location', is_anonymous: true }));
  }
  await syncSpotMembership(posts[2].id);
  const spotId = (await posts[2].get()).get('spot_id'); assert.ok(spotId);
  const spotRef = db.collection('note_spots').doc(spotId);
  for (let i = 0; i < 12; i++) {
    const s = await spotRef.get(), lat = s.get('lat') + (s.get('radius') + SPOT_JOIN_RADIUS_M - 0.01) * degreesPerMeter;
    const p = await post(owner.luid, { lat, lng, geohash: encodeGeohash(lat, lng, 9), note_kind: 'location', is_anonymous: true });
    await syncSpotMembership(p.id); assert.equal((await p.get()).get('spot_id'), spotId); posts.push(p);
  }
  const members = await db.collection('posts').where('spot_id', '==', spotId).get();
  assert.equal(members.size, 17);
  const fix = { lat: (await spotRef.get()).get('lat'), lng, accuracy: 0, measuredAt: Date.now() };
  const farthest = Math.max(...members.docs.map(p => distanceMeters(fix.lat, lng, p.get('lat'), lng)));
  const span = distanceMeters(Math.min(...members.docs.map(p => p.get('lat'))), lng,
    Math.max(...members.docs.map(p => p.get('lat'))), lng);
  assert.ok(farthest > MAX_SPOT_RADIUS_M); assert.ok(span > 100);
  const result = await reader.call({ mode: 'map_group', groupId: `spot:${spotId}`, pageSize: 50, location: fix });
  assert.equal(result.posts.filter(p => !p.locked && p.caption).length, 17);
  t.diagnostic(JSON.stringify({ scenario: 'spot_edge_join_drift', members: members.size,
    storedRadiusM: (await spotRef.get()).get('radius'), farthestMemberFromReaderM: Math.round(farthest),
    totalSpanM: Math.round(span), readableBodies: result.posts.length }));
});

test('baseline: a fresh event with already-correct counters still attempts an unchanged target write', async t => {
  const v = await viewer(), p = await post(v.luid, { likes_count: 0, comments_count: 0, views_count: 0, engagement_score: 0 });
  const io = countIO(t);
  assert.equal(await applyCountersOnce(randomUUID(), [{ path: p.path, fields: ['likes_count'] }]), true);
  assert.equal(io.updates, 1); assert.equal(io.creates, 1);
  t.diagnostic(JSON.stringify({ scenario: 'already_correct_counter', ...io,
    note: 'aggregate index entries and actual billing are not measured; receipt remains required' }));
});

test('baseline: default approval threshold 3 hydrates 200 mature liker profiles before stopping', async t => {
  const v = await viewer(), now = Date.now();
  const created = Timestamp.fromMillis(now - 2 * 86_400_000), eligible = Timestamp.fromMillis(now - 86_400_000);
  const p = await post(v.luid, { note_kind: 'location', likes_count: 300, push_state: 'none' });
  await db.collection('system').doc('place_notes').set({ approval_index_version: 1, push_like_threshold: 3 });
  for (let chunk = 0; chunk < 3; chunk++) {
    const batch = db.batch();
    for (let i = 0; i < 100; i++) {
      const id = randomUUID();
      batch.set(db.collection('profiles').doc(id), { created_at: created });
      batch.set(db.collection('likes').doc(`${p.id}_${id}`), { post_id: p.id, user_id: id, notification_eligible_at: eligible });
    }
    await batch.commit();
  }
  const io = countIO(t);
  assert.equal(await autoApproveNote(p.id, now), true);
  assert.equal(io.queryRows, 200); assert.equal(io.pointReads, 402);
  t.diagnostic(JSON.stringify({ scenario: 'mature_approval_threshold3', ...io,
    note: 'all candidates qualify; safe progressive hydration must still support invalid accounts and thresholds above 200' }));
});

test('baseline: deleting ten posts repeats session/edge queries even with only one matching session', async t => {
  const v = await viewer(), ids = [];
  for (let i = 0; i < 10; i++) ids.push((await post(v.luid)).id);
  const session = db.collection('map_group_sessions').doc(randomUUID());
  await session.set({ owner_luid: randomUUID(), post_ids: ids });
  await db.collection('account_deletion_jobs').doc(v.luid).set({ uid: `synthetic-${v.luid}`, status: 'pending', stage: 'firestore' });
  const io = countIO(t);
  assert.equal(await runAccountDeletion(v.luid, { deleteStorage: async () => 0, deleteAuthUser: async () => {} }), 'done');
  assert.ok(io.sessionQueries >= 10);
  const measured = { ...io };
  assert.equal((await session.get()).exists, false);
  t.diagnostic(JSON.stringify({ scenario: 'delete10_posts_one_shared_session', ...measured,
    note: 'session post_ids array index is REQUIRED by current hard-delete queries; do not exempt it without a replacement' }));
});
