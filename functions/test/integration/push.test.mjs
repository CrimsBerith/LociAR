// Push notifications (issue #19 K1): device registration, the sender's block / quota / dead-token
// rules and account-deletion cleanup. FCM itself is stubbed. Run via `npm run test:emulator`.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, expectFailure, newUser } from './_harness.mjs';
import { deviceDocId, MAX_PUSHES_PER_HOUR, sendActivityPush } from '../../lib/push.js';

after(async () => closeClients());

const token = () => `fcm_${randomUUID().replace(/-/g, '')}:${randomUUID().replace(/-/g, '')}`;
const stub = (failWith) => {
  const sent = [];
  return { sent, deps: { send: async (message) => { if (failWith) throw Object.assign(new Error('x'), { code: failWith }); sent.push(message); return 'id'; } } };
};

test('registerPushToken stores the token under its hash for the caller; unregister removes it', async () => {
  const user = await newUser();
  const t = token();
  assert.deepEqual(await user.call('registerPushToken', { token: t, locale: 'tr-TR' }), { registered: true });
  const doc = await adminDb.collection('push_devices').doc(deviceDocId(t)).get();
  assert.equal(doc.data().luid, user.luid);
  assert.equal(doc.data().locale, 'tr-TR');
  assert.ok(doc.data().expires_at.toMillis() > Date.now() + 59 * 86_400_000);
  const other = await newUser();
  await other.call('unregisterPushToken', { token: t });
  assert.equal((await adminDb.collection('push_devices').doc(deviceDocId(t)).get()).exists, true, 'another user cannot remove it');
  await user.call('unregisterPushToken', { token: t });
  assert.equal((await adminDb.collection('push_devices').doc(deviceDocId(t)).get()).exists, false);
  const bad = await expectFailure(user.call('registerPushToken', { token: 'short' }));
  assert.equal(bad.code, 'functions/invalid-argument');
});

test('sender: notifies every device, skips blocked actors, stops at the hourly cap, drops dead tokens', async () => {
  const recipient = await newUser();
  const actor = await newUser();
  const t1 = token(), t2 = token();
  await recipient.call('registerPushToken', { token: t1 });
  await recipient.call('registerPushToken', { token: t2 });

  const ok = stub();
  assert.equal(await sendActivityPush('like', actor.luid, recipient.luid, 'p-1', ok.deps), 2);
  assert.deepEqual(ok.sent[0].apns.payload.aps.alert.locKey, 'push.like');
  assert.equal(ok.sent[0].data.post_id, 'p-1');

  await adminDb.collection('user_blocks').doc(`${recipient.luid}_${actor.luid}`).set({ blocker_id: recipient.luid, blocked_id: actor.luid });
  const blocked = stub();
  assert.equal(await sendActivityPush('comment', actor.luid, recipient.luid, 'p-1', blocked.deps), 0);
  assert.equal(blocked.sent.length, 0);
  await adminDb.collection('user_blocks').doc(`${recipient.luid}_${actor.luid}`).delete();

  const hour = `${recipient.luid}_h${Math.floor(Date.now() / 3_600_000)}`;
  await adminDb.collection('push_quota').doc(hour).set({ owner_luid: recipient.luid, count: MAX_PUSHES_PER_HOUR });
  const capped = stub();
  assert.equal(await sendActivityPush('follow', actor.luid, recipient.luid, null, capped.deps), 0);
  await adminDb.collection('push_quota').doc(hour).delete();

  const dead = stub('messaging/registration-token-not-registered');
  assert.equal(await sendActivityPush('follow', actor.luid, recipient.luid, null, dead.deps), 0);
  const left = await adminDb.collection('push_devices').where('luid', '==', recipient.luid).get();
  assert.equal(left.size, 0, 'dead tokens are removed');
});

test('deleteAccount removes the account\'s push devices', async () => {
  const user = await newUser();
  const t = token();
  await user.call('registerPushToken', { token: t });
  assert.deepEqual(await user.call('deleteAccount', {}), { ok: true });
  assert.equal((await adminDb.collection('push_devices').doc(deviceDocId(t)).get()).exists, false);
});
