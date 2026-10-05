import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, expectFailure, newUser, PROJECT } from './_harness.mjs';
import { deliverActivityPush } from '../../lib/push.js';
import { pushTokenId } from '../../lib/pushPolicy.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Activity tests require emulators');
after(closeClients);
const request = (user, ids) => ({ userId: user.luid, activityIds: ids });
async function event(user, overrides = {}) {
  const id = `follow_${randomUUID()}_${user.luid}`;
  const ref = adminDb.collection('activity_events').doc(id);
  await ref.set({ id, recipient_id: user.luid, actor_id: randomUUID(), kind: 'follow', read_at: null, created_at: Timestamp.now(), ...overrides });
  return ref;
}

test('markActivityRead persists the real composite document ID and a server read time', async () => {
  const user = await newUser(); const ref = await event(user);
  const before = (await ref.get()).data();
  const start = Date.now();
  const response = await user.call('markActivityRead', request(user, [ref.id]));
  assert.equal(response.activities[0].id, ref.id);
  const saved = (await ref.get()).data();
  assert.equal(saved.read_at.toDate().toISOString(), response.activities[0].readAt);
  assert.ok(saved.read_at.toMillis() >= start && saved.read_at.toMillis() <= Date.now());
  assert.deepEqual({ ...saved, read_at: null }, before, 'only read_at changes');
});

test('read state preserves its first timestamp on duplicate and concurrent calls', async () => {
  const user = await newUser(); const ref = await event(user);
  const payload = request(user, [ref.id, ref.id]);
  const responses = await Promise.all([user.call('markActivityRead', payload), user.call('markActivityRead', payload)]);
  assert.equal(responses[0].activities.length, 1);
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(await user.call('markActivityRead', payload), responses[0]);
});

test('a foreign activity rejects the entire batch and no record changes', async () => {
  const alice = await newUser(); const bob = await newUser();
  const own = await event(alice); const other = await event(bob);
  const rejected = await expectFailure(alice.call('markActivityRead', request(alice, [own.id, other.id])));
  assert.equal(rejected.code, 'functions/permission-denied');
  assert.equal((await own.get()).get('read_at'), null);
  assert.equal((await other.get()).get('read_at'), null);
  assert.equal((await expectFailure(alice.call('markActivityRead', request(bob, [own.id])))).code, 'functions/permission-denied');
});

test('missing/deleted activity is a no-op, never a newly created record', async () => {
  const user = await newUser(); const own = await event(user); const missing = `missing-${randomUUID()}`;
  const response = await user.call('markActivityRead', request(user, [missing, own.id]));
  assert.deepEqual(response.activities.map(item => item.id), [own.id]);
  assert.equal((await adminDb.collection('activity_events').doc(missing).get()).exists, false);
});

test('read callable rejects unauthenticated, invalid paths and oversized batches; 50 rows work', async () => {
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/markActivityRead`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }),
  });
  assert.equal(response.status, 401);
  const user = await newUser();
  for (const ids of [[], null, 'not-array', ['a/b'], ['..'], ['a\n'], [123], ['x'.repeat(201)], Array(51).fill('a')]) {
    assert.equal((await expectFailure(user.call('markActivityRead', request(user, ids)))).code, 'functions/invalid-argument');
  }
  const refs = await Promise.all(Array.from({ length: 50 }, () => event(user)));
  const marked = await user.call('markActivityRead', request(user, refs.map(ref => ref.id)));
  assert.equal(marked.activities.length, 50);
});

test('acknowledged activity no longer begins a new push send attempt', async () => {
  const recipient = await newUser(); const actor = await newUser();
  const ref = await event(recipient, { actor_id: actor.luid });
  const token = `synthetic-fcm-${randomUUID()}-${randomUUID()}`;
  await recipient.call('registerPushToken', { token, installationId: randomUUID(), userId: recipient.luid, locale: 'en' });
  assert.equal((await adminDb.collection('push_tokens').doc(pushTokenId(token)).get()).exists, true);
  await recipient.call('markActivityRead', request(recipient, [ref.id]));
  assert.equal(await deliverActivityPush(ref.id, async () => { throw new Error('must not send'); }), 0);
});
