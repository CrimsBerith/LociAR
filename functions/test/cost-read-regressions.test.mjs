import test from 'node:test';
import assert from 'node:assert/strict';
import { db, auth as adminAuth, Timestamp, luidForUid } from '../lib/core.js';
import { readPublicContent } from '../lib/publicContent.js';
import { searchGifs } from '../lib/giphy.js';
import { deliverActivityPush } from '../lib/push.js';
import { ownCampaignOffers } from '../lib/campaigns.js';
import { onPostWritten, onProfileUpdated } from '../lib/triggers.js';
import { ensureProfile } from '../lib/profile.js';

const uid = 'cost-regression-viewer', viewer = luidForUid(uid);
const author = '33333333-3333-4333-8333-333333333333', postId = '22222222-2222-4222-8222-222222222222';
const auth = { uid, token: { email_verified: true, firebase: { sign_in_provider: 'password' } } };
const snapshot = (ref, data) => ({ ref, id: ref.id, exists: data != null, data: () => data, get: key => data?.[key] });
function transaction(t, dataFor) {
  let reads = 0, writes = 0;
  const tx = {
    get: async ref => { assert.equal(typeof ref.path, 'string', 'unexpected query'); reads++; return snapshot(ref, dataFor(ref)); },
    getAll: async (...refs) => { reads += refs.length; return refs.map(ref => snapshot(ref, dataFor(ref))); },
    set: () => { writes++; }, create: () => { writes++; }, update: () => { writes++; }, delete: () => { writes++; },
  };
  t.mock.method(db, 'runTransaction', async callback => callback(tx));
  return { tx, reads: () => reads, writes: () => writes };
}

test('own_receipt performs one fresh account transaction and still rejects suspended accounts', async t => {
  let suspended = false;
  const io = transaction(t, ref => {
    if (ref.parent.id === 'profiles') return { suspended };
    assert.ok(['account_deletion_jobs', 'posts'].includes(ref.parent.id));
  });
  assert.deepEqual(await readPublicContent.run({ auth, data: { mode: 'own_receipt', postId } }), { receipt: null });
  assert.equal(io.reads(), 3);
  suspended = true;
  await assert.rejects(readPublicContent.run({ auth, data: { mode: 'own_receipt', postId } }), error => error.code === 'permission-denied');
  assert.equal(io.reads(), 5, 'the rejected account never reads the post');
});

test('parallel GIF searches share only the external request, never account/quota checks; failures can retry', async t => {
  const previousKey = process.env.GIPHY_API_KEY;
  process.env.GIPHY_API_KEY = 'fake-api-key';
  const io = transaction(t, ref => {
    assert.ok(['profiles', 'account_deletion_jobs', 'gif_search_quota'].includes(ref.parent.id));
    if (ref.parent.id === 'profiles') return {};
  });
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  let fail = false;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; await gate;
    if (fail) throw new Error('synthetic-network-failure');
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  const request = (index, query, offset = 0, locale = 'en') => searchGifs.run({
    auth: { ...auth, uid: `cost-search-${index}` }, data: { query, offset, locale },
  });
  try {
    const pending = Array.from({ length: 8 }, (_, i) => request(i, 'shared-cost-regression'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1); release();
    await Promise.all(pending);
    assert.equal(io.reads(), 24); assert.equal(io.writes(), 8);
    await request(8, 'shared-cost-regression'); assert.equal(calls, 1);
    assert.equal(io.reads(), 27); assert.equal(io.writes(), 9);
    await Promise.all([request(9, 'shared-cost-regression', 24), request(10, 'shared-cost-regression', 0, 'tr')]);
    assert.equal(calls, 3, 'locale and page do not share results');
    fail = true;
    await assert.rejects(request(11, 'failed-cost-regression'), error => error.details?.reason === 'gif_unavailable');
    fail = false;
    await request(12, 'failed-cost-regression');
    assert.equal(calls, 5, 'a rejected pending lookup is removed');
  } finally {
    release();
    if (previousKey === undefined) delete process.env.GIPHY_API_KEY;
    else process.env.GIPHY_API_KEY = previousKey;
  }
});

for (const mode of ['disabled', 'receipt', 'quota']) {
  test(`push ${mode} rejection reads only the early gate for ten devices`, async t => {
    const initial = { actor_id: author, recipient_id: viewer, post_id: postId, kind: 'like' };
    const io = transaction(t, ref => {
      if (ref.parent.id === 'push_delivery_receipts') return mode === 'receipt' ? { status: 'attempted' } : undefined;
      if (ref.parent.id === 'push_quota') return mode === 'quota' ? { count: 3, activity_ids: ['a', 'b', 'c'] } : undefined;
      if (ref.parent.id === 'user_data_preferences') return { notifications: mode !== 'disabled' };
      throw new Error('early rejection hydrated ' + ref.parent.id);
    });
    let outerReads = 0;
    const collection = db.collection.bind(db);
    t.mock.method(db, 'collection', name => {
      if (name === 'activity_events') return { doc: id => ({ get: async () => { outerReads++; return { data: () => initial }; } }) };
      if (name === 'push_tokens') return { where: () => ({ limit: limit => ({ get: async () => {
        assert.equal(limit, 10); outerReads += 10;
        return { docs: Array.from({ length: 10 }, (_, i) => snapshot(collection(name).doc('device-' + i), {})) };
      } }) }) };
      return collection(name);
    });
    assert.equal(await deliverActivityPush('cost-activity', async () => { assert.fail('unexpected send'); }), 0);
    assert.equal(outerReads + io.reads(), 41); assert.equal(io.writes(), 0);
  });
}

test('campaign opt-out avoids querying or hydrating assignments', async t => {
  const io = transaction(t, ref => {
    if (ref.parent.id === 'profiles') return {};
    if (ref.parent.id === 'account_deletion_jobs') return undefined;
    if (ref.parent.id === 'user_data_preferences') return { promotions: false };
    throw new Error('opt-out hydrated ' + ref.parent.id);
  });
  assert.deepEqual(await ownCampaignOffers(viewer, 41, 29, 120), []);
  assert.equal(io.reads(), 3); assert.equal(io.writes(), 0);
});

test('counter-only profile changes skip I/O even with equal timestamp/map instances', async t => {
  t.mock.method(db, 'runTransaction', () => { assert.fail('counter-only transaction'); });
  const before = { follower_count: 1, created_at: Timestamp.fromMillis(123), preferences: { a: [1, 2] } };
  const after = { follower_count: 2, created_at: Timestamp.fromMillis(123), preferences: { a: [1, 2] } };
  await onProfileUpdated.run({ params: { luid: viewer }, data: { before: { data: () => before }, after: { data: () => after } } });
});

test('a suspension alongside a counter change keeps fresh checks and updates the access fence', async t => {
  const before = { handle: 'synthetic', follower_count: 1, suspended: false };
  const after = { ...before, follower_count: 2, suspended: true };
  const io = transaction(t, ref => {
    if (ref.parent.id === 'profiles') return after;
    if (ref.parent.id === 'account_access') return { state: 'active' };
    assert.equal(ref.parent.id, 'account_deletion_jobs');
  });
  await onProfileUpdated.run({ params: { luid: viewer }, data: { before: { data: () => before }, after: { data: () => after } } });
  assert.equal(io.reads(), 3); assert.equal(io.writes(), 1);
});

test('a short profile resume avoids unchanged writes but still refreshes identity, terms and access changes', async t => {
  const existingPrivate = { uid, email: null, auth_provider: 'password', identity_verified: true, last_seen_at: Timestamp.now() };
  let suspended = false;
  t.mock.method(adminAuth, 'getUser', async () => ({ customClaims: { luid: viewer } }));
  const io = transaction(t, ref => {
    if (ref.parent.id === 'profiles') return { handle: 'synthetic', suspended };
    if (ref.parent.id === 'users_private') return existingPrivate;
    if (ref.parent.id === 'handles') return { luid: viewer };
    if (ref.parent.id === 'account_access') return { state: 'active' };
    assert.equal(ref.parent.id, 'account_deletion_jobs');
  });
  await ensureProfile.run({ auth, data: {} }); assert.equal(io.writes(), 0);
  await ensureProfile.run({ auth, data: { termsVersion: '2026-10-23' } }); assert.equal(io.writes(), 1);
  suspended = true;
  await ensureProfile.run({ auth, data: {} }); assert.equal(io.writes(), 2, 'suspension updates account_access even inside the heartbeat window');
  suspended = false; existingPrivate.identity_verified = false;
  await ensureProfile.run({ auth, data: {} }); assert.equal(io.writes(), 3, 'verified identity change is not delayed');
});

test('anonymous post deletion skips profile recount and keeps status/media cleanup', async t => {
  let recount = false;
  transaction(t, ref => {
    if (ref.parent.id === 'trigger_receipts' || ref.parent.id === 'profiles') recount = true;
    assert.ok(['posts', 'account_deletion_jobs', 'media_purge_queue'].includes(ref.parent.id));
  });
  const before = { creator_id: author, status: 'active', visibility: 'public', is_anonymous: true };
  // Deletion cleanup does not need Storage here; there are no media paths in this text note.
  await onPostWritten.run({ id: 'cost-anonymous-delete', params: { postId }, data: { before: { data: () => before }, after: { data: () => undefined } } });
  assert.equal(recount, false);
});
