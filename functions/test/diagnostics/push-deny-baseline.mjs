/** Baseline diagnosis only. Passing reproduces work before a known notifications denial.
 * Uses real Admin SDK reads in a disposable emulator and an injected sender that must never run.
 * Logical result counts exclude empty-query minima, indexes, retries and production billing.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-lociar');
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db, Timestamp } = await import('../../lib/core.js');
assert.equal(db.projectId, 'demo-lociar');
const { deliverActivityPush, deliverPostApprovedPush } = await import('../../lib/push.js');
after(async () => { await deleteApp(getApp()); });

function countReads(t) {
  const counts = { pointReads: 0, queryCalls: 0, queryRows: 0 };
  const query = Object.getPrototypeOf(db.collection('_audit').where('value', '==', true));
  const get = query.get;
  t.mock.method(query, 'get', async function (...args) {
    const result = await get.apply(this, args);
    counts.queryCalls++;
    counts.queryRows += result.size;
    return result;
  });
  const document = Object.getPrototypeOf(db.collection('_audit').doc('point'));
  const getDocument = document.get;
  t.mock.method(document, 'get', async function (...args) {
    counts.pointReads++;
    return getDocument.apply(this, args);
  });
  const run = db.runTransaction.bind(db);
  t.mock.method(db, 'runTransaction', (operation, ...options) => run(async tx => operation(new Proxy(tx, {
    get(target, key) {
      if (key === 'getAll') return async (...refs) => { counts.pointReads += refs.length; return target.getAll(...refs); };
      if (key === 'get') return async ref => { counts.pointReads++; return target.get(ref); };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  })), ...options));
  return counts;
}

async function fixture() {
  const recipient = randomUUID(), actor = randomUUID(), activity = randomUUID(), post = randomUUID();
  const batch = db.batch();
  batch.set(db.collection('user_data_preferences').doc(recipient), { notifications: false });
  batch.set(db.collection('activity_events').doc(activity), { kind: 'like', actor_id: actor, recipient_id: recipient, post_id: post });
  batch.set(db.collection('posts').doc(post), { creator_id: recipient, status: 'active' });
  for (let i = 0; i < 10; i++) batch.set(db.collection('push_tokens').doc(randomUUID()), {
    owner_luid: recipient, token: 'synthetic-push-address-' + i, expires_at: Timestamp.fromMillis(Date.now() + 60_000),
  });
  await batch.commit();
  return { activity, post };
}

test('baseline: activity with notifications disabled still reads all ten devices and per-device gates', async t => {
  const f = await fixture(), counts = countReads(t);
  assert.equal(await deliverActivityPush(f.activity, async () => assert.fail('must not send')), 0);
  assert.equal(counts.queryRows, 10);
  assert.equal(counts.pointReads, 31);
  t.diagnostic(JSON.stringify({ scenario: 'notifications_off_activity_ten_devices', ...counts,
    note: 'deny-only recipient precheck is a candidate; allowed delivery still needs fresh per-device checks' }));
});

test('baseline: post-approval push hydrates six documents per device before the same denial', async t => {
  const f = await fixture(), counts = countReads(t);
  assert.equal(await deliverPostApprovedPush(f.post, async () => assert.fail('must not send')), 0);
  assert.equal(counts.queryRows, 10);
  assert.equal(counts.pointReads, 61);
  t.diagnostic(JSON.stringify({ scenario: 'notifications_off_approval_ten_devices', ...counts,
    note: 'no push or provider request occurred; this is not an acceptance assertion' }));
});
