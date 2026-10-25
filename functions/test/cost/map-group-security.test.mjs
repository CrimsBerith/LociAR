import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Healthy acceptance tests: real callable handlers and Firestore transactions, emulator only.
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';
assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/, 'Loopback Firestore emulator required');
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-lociar';
assert.match(project, /^demo-[a-z0-9-]+$/, 'A demo project is mandatory');
if (process.env.FIREBASE_CONFIG) {
  const existing = JSON.parse(process.env.FIREBASE_CONFIG);
  if (existing.projectId) assert.equal(existing.projectId, project, 'FIREBASE_CONFIG must match the demo project');
}
process.env.GCLOUD_PROJECT = project;
process.env.GOOGLE_CLOUD_PROJECT = project;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: project, storageBucket: `${project}.appspot.com` });
process.env.FUNCTIONS_EMULATOR = 'true';
const repo = path.resolve(__dirname, '../../..');
const lib = path.join(repo, 'functions/lib');
const { db, Timestamp, luidForUid } = require(path.join(lib, 'core.js'));
const { readPublicContent } = require(path.join(lib, 'publicContent.js'));
const { splitLegacySpot, denseLocks } = require(path.join(lib, 'denseSpots.js'));
const { splitSpotPlan } = require(path.join(lib, 'mapNoteGroups.js'));
const { distanceMeters, encodeGeohash } = require(path.join(lib, 'geo.js'));
assert.equal(db.projectId, project);
const uid = `map-security-viewer-${randomUUID()}`, viewer = luidForUid(uid), author = luidForUid(`map-security-author-${randomUUID()}`);
const spotId = randomUUID(), ids = Array.from({ length: 19 }, () => randomUUID()).sort();
const activeIds = ids.slice(0, 17), hiddenId = ids[17], missingId = ids[18];
const oldToken = randomUUID(), poisonedToken = randomUUID(), tokens = new Set([oldToken, poisonedToken]);
const centre = { lat: 41, lng: 29, radius: 40 }, step = 180 / (Math.PI * 6371008.8);
const points = activeIds.map((id, i) => ({ id, lat: centre.lat + (153 * i / 16 - 76.5) * step, lng: centre.lng, spotId }));
const targetIds = new Set([spotId, ...splitSpotPlan(spotId, centre, points).map(g => g.id)]);
const fixedRefs = [db.collection('profiles').doc(viewer), db.collection('profiles').doc(author),
  ...ids.map(id => db.collection('posts').doc(id)), ...ids.map(id => db.collection('note_spot_members').doc(id)),
  ...[...targetIds].map(id => db.collection('note_spots').doc(id)), db.collection('note_spot_migrations').doc(spotId)];
const block = db.collection('user_blocks').doc(`${viewer}_${author}`);
const call = async body => {
  const response = await readPublicContent.run({ data: body, auth: { uid, token: {
    luid: viewer, email: 'map-security@example.invalid', email_verified: true,
    firebase: { sign_in_provider: 'password', identities: { email: ['map-security@example.invalid'] } },
  } } });
  if (response.pageToken) tokens.add(response.pageToken);
  return response;
};
const fix = p => ({ lat: p.lat, lng: p.lng, accuracy: 0, measuredAt: Date.now() });
const capture = async refs => (await db.getAll(...refs)).map(d => ({ path: d.ref.path, exists: d.exists,
  updated: d.updateTime?.toDate().toISOString(), data: d.data() })).sort((a, b) => a.path.localeCompare(b.path));
let completed = 0;
let parent;
async function check(name, fn) { await parent.test(name, fn); completed++; }
async function main() {
  const seed = db.batch();
  seed.set(db.collection('profiles').doc(viewer), { handle: `f05.viewer.${viewer.slice(0, 8)}`, suspended: false });
  seed.set(db.collection('profiles').doc(author), { handle: `f05.author.${author.slice(0, 8)}`, suspended: false });
  seed.set(db.collection('note_spots').doc(spotId), { ...centre, count: 17, geohash: encodeGeohash(centre.lat, centre.lng, 9) });
  for (const [i, p] of points.entries()) {
    seed.set(db.collection('posts').doc(p.id), { lat: p.lat, lng: p.lng, geohash: encodeGeohash(p.lat, p.lng, 9),
      spot_id: spotId, creator_id: author, creator_handle: 'f05.author', is_anonymous: true,
      note_kind: 'location', status: 'active', visibility: 'public', age_rating: 'all', caption: `acceptance-body-${i}`,
      edit_data_json: JSON.stringify({ version: 1, layers: [{ type: 'text', text: `acceptance-body-${i}` }] }),
      likes_count: 17 - i, created_at: Timestamp.fromMillis(Date.now() - i * 1000) });
    seed.set(db.collection('note_spot_members').doc(p.id), { post_id: p.id, spot_id: spotId, owner_luid: author });
  }
  seed.set(db.collection('posts').doc(hiddenId), { lat: centre.lat, lng: centre.lng, spot_id: spotId,
    creator_id: author, note_kind: 'location', status: 'hidden', visibility: 'public', caption: 'hidden preserved' });
  for (const id of [hiddenId, missingId]) seed.set(db.collection('note_spot_members').doc(id), { post_id: id, spot_id: spotId, owner_luid: author });
  await seed.commit();
  let groups;
  await check('real map summaries partition 17 legacy notes spanning 153 m losslessly within 25 m', async () => {
    const response = await call({ mode: 'map_groups', latitude: centre.lat, longitude: centre.lng, radiusMeters: 200 });
    // Other root-owned fixtures may coexist; only inspect this probe's exact UUIDs.
    groups = response.groups.filter(g => g.post_ids.some(id => activeIds.includes(id)));
    assert.deepEqual(groups.flatMap(g => g.post_ids).sort(), activeIds.toSorted());
    assert.ok(groups.length > 1);
    const byId = new Map(points.map(p => [p.id, p]));
    for (const g of groups) for (const id of g.post_ids) {
      const p = byId.get(id); assert.ok(p); assert.ok(distanceMeters(g.lat, g.lng, p.lat, p.lng) <= 25);
    }
  });
  await check('each real handler reads only the requested canonical members; remote fixes retain locks', async () => {
    for (const g of groups) {
      const onSite = await call({ mode: 'map_group', groupId: g.id, location: fix(g) });
      assert.deepEqual(onSite.posts.map(p => p.id).sort(), g.post_ids.toSorted());
      assert.ok(onSite.posts.every(p => !p.locked && p.caption.startsWith('acceptance-body-')));
      const remote = await call({ mode: 'map_group', groupId: g.id, location: fix({ lat: centre.lat + .02, lng: centre.lng }) });
      assert.ok(remote.posts.every(p => p.locked && p.caption === ''));
    }
  });
  await check('readArea cannot open an explicitly listed member beyond its canonical 25 m centre', async () => {
    const first = groups.find(g => g.post_ids.includes(activeIds[0]));
    const far = await db.collection('posts').doc(activeIds[16]).get();
    const locks = await denseLocks([far], viewer, fix(first), { ...first, id: spotId, post_ids: [far.id], groupId: first.id });
    assert.ok(locks.has(far.id));
  });
  await check('profile blocks cannot move the raw physical access circle for anonymous members', async () => {
    const anchor = db.collection('posts').doc(activeIds[0]); await anchor.update({ is_anonymous: false });
    const request = { mode: 'map_group', groupId: `spot:${spotId}`, location: fix(groups.find(g => g.post_ids.includes(activeIds[0]))) };
    const before = await call(request); await block.set({ blocker_id: viewer, blocked_id: author });
    const after = await call(request);
    for (const field of ['lat', 'lng', 'radius']) assert.equal(after.group[field], before.group[field]);
    assert.deepEqual(after.posts.map(p => p.id).sort(), before.posts.filter(p => p.id !== activeIds[0]).map(p => p.id).sort());
    assert.ok(after.posts.every(p => !p.locked)); await block.delete(); await anchor.update({ is_anonymous: true });
  });
  await check('pre-v2 legacy cursors reject; a poisoned v2 session cannot carry distant bodies', async () => {
    for (const [token, version] of [[oldToken, undefined], [poisonedToken, 2]]) {
      const data = { owner_luid: viewer, requested_group_id: `spot:${spotId}`, group_id: `spot:${spotId}`,
        post_ids: activeIds, expires_at: Timestamp.fromMillis(Date.now() + 60000) };
      if (version) data.membership_version = version;
      await db.collection('map_group_sessions').doc(token).set(data);
    }
    await assert.rejects(call({ mode: 'map_group', groupId: `spot:${spotId}`, pageToken: oldToken, offset: 1,
      location: fix(points[0]) }), e => e.code === 'failed-precondition');
    const page = await call({ mode: 'map_group', groupId: `spot:${spotId}`, pageToken: poisonedToken, offset: 15,
      location: fix(points[0]) });
    assert.deepEqual(page.posts, []);
  });
  await check('offline migration preview performs zero mutations, apply demands paused writers', async () => {
    const before = await capture(fixedRefs); const preview = await splitLegacySpot(spotId);
    assert.equal(preview.applied, false); assert.deepEqual(await capture(fixedRefs), before);
    await assert.rejects(splitLegacySpot(spotId, { apply: true }), /Pause/);
    assert.deepEqual(await capture(fixedRefs), before);
  });
  await check('real Firestore transaction migration preserves all posts/counts, retains in-radius source members and clears hidden/orphan membership', async () => {
    const result = await splitLegacySpot(spotId, { apply: true, writesPaused: true }); assert.equal(result.phase, 'complete');
    let total = 0;
    for (const id of activeIds) {
      const post = await db.collection('posts').doc(id).get(); assert.ok(post.exists);
      const target = await db.collection('note_spots').doc(post.get('spot_id')).get();
      assert.ok(distanceMeters(target.get('lat'), target.get('lng'), post.get('lat'), post.get('lng')) <= 25);
      const member = await db.collection('note_spot_members').doc(id).get(); assert.equal(member.get('spot_id'), target.id);
      const original = points.find(p => p.id === id);
      if (distanceMeters(centre.lat, centre.lng, original.lat, original.lng) <= 25) assert.equal(target.id, spotId);
    }
    for (const id of targetIds) { const target = await db.collection('note_spots').doc(id).get(); if (target.exists) total += target.get('count'); }
    assert.equal(total, 17);
    const hidden = await db.collection('posts').doc(hiddenId).get(); assert.ok(hidden.exists); assert.equal(hidden.get('caption'), 'hidden preserved');
    assert.equal(hidden.get('spot_id'), undefined);
    assert.equal((await db.collection('posts').doc(missingId).get()).exists, false);
    for (const id of [hiddenId, missingId]) assert.equal((await db.collection('note_spot_members').doc(id).get()).exists, false);
    assert.equal((await db.collection('note_spot_migrations').doc(spotId).get()).get('phase'), 'complete');
  });
  await check('second offline apply leaves source/target/member/journal data and updateTimes unchanged', async () => {
    const journal = db.collection('note_spot_migrations').doc(spotId);
    const [groupDocs, memberDocs] = await Promise.all([journal.collection('groups').get(), journal.collection('members').get()]);
    const refs = [...fixedRefs, ...groupDocs.docs.map(d => d.ref), ...memberDocs.docs.map(d => d.ref)];
    const before = await capture(refs); const result = await splitLegacySpot(spotId, { apply: true, writesPaused: true });
    assert.equal(result.applied, false); assert.deepEqual(await capture(refs), before);
  });
  assert.equal(completed, 8);
}
async function cleanup() {
  await db.recursiveDelete(db.collection('note_spot_migrations').doc(spotId));
  const receipts = await db.collection('dense_spot_unlocks').where('owner_luid', '==', viewer).get();
  const refs = [...fixedRefs.filter(r => r.path !== `note_spot_migrations/${spotId}`), block,
    ...[...tokens].map(id => db.collection('map_group_sessions').doc(id)), ...receipts.docs.map(d => d.ref)];
  for (let start = 0; start < refs.length; start += 400) { const batch = db.batch(); for (const r of refs.slice(start, start + 400)) batch.delete(r); await batch.commit(); }
}
test('canonical map groups, old cursors and offline journal remain safe', async t => {
  parent = t;
  try { await main(); } finally { await cleanup(); await db.terminate(); }
});
