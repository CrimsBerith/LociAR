import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb, closeClients, expectFailure, newUser, PROJECT } from './_harness.mjs';
import { deliverActivityPush } from '../../lib/push.js';
import { MAX_PUSH_DEVICES, pushDeliveryId, pushTokenId } from '../../lib/pushPolicy.js';
import { onLikeCreated } from '../../lib/triggers.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Push tests require Auth and Firestore emulators');
after(closeClients);
const token = () => `synthetic-fcm-${randomUUID()}-${randomUUID()}`;
const registration = (user, value = token(), installationId = randomUUID()) => ({ token: value, installationId, userId: user.luid, locale: 'tr-TR' });
const tokenRef = value => adminDb.collection('push_tokens').doc(pushTokenId(value));

async function activityFixture(kind = 'like') {
  const recipient = await newUser();
  const actor = await newUser();
  const postId = randomUUID();
  const id = `push-${randomUUID()}`;
  const payload = registration(recipient);
  await recipient.call('registerPushToken', payload);
  await adminDb.collection('posts').doc(postId).set({ creator_id: recipient.luid, status: 'active', visibility: 'public' });
  const ref = adminDb.collection('activity_events').doc(id);
  await ref.set({ id, kind, actor_id: actor.luid, recipient_id: recipient.luid, post_id: kind === 'follow' ? null : postId, body: 'Private text must not leave the feed', read_at: null, created_at: Timestamp.now() });
  return { recipient, actor, postId, id, payload, ref };
}

test('push registration binds the caller, stores privately, rotates and unregisters idempotently', async () => {
  const user = await newUser();
  const first = registration(user);
  assert.deepEqual(await user.call('registerPushToken', first), { ok: true });
  assert.deepEqual(await user.call('registerPushToken', first), { ok: true });
  const saved = (await tokenRef(first.token).get()).data();
  assert.equal(saved.owner_luid, user.luid);
  assert.equal(saved.locale, 'tr');
  assert.ok(saved.expires_at.toMillis() > Date.now() + 29 * 86_400_000);
  const second = { ...first, token: token() };
  await user.call('registerPushToken', second);
  assert.equal((await tokenRef(first.token).get()).exists, false);
  assert.equal((await tokenRef(second.token).get()).exists, true);
  assert.deepEqual(await user.call('unregisterPushToken', second), { ok: true });
  assert.deepEqual(await user.call('unregisterPushToken', second), { ok: true });
  assert.equal((await tokenRef(second.token).get()).exists, false);
});

test('push callables reject unauthenticated, malformed and cross-session registrations', async () => {
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/registerPushToken`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }) });
  assert.equal(response.status, 401);
  const user = await newUser();
  const payload = registration(user);
  for (const bad of [{ ...payload, token: 'short' }, { ...payload, token: token() + '\n' }, { ...payload, installationId: 'wrong' }]) {
    assert.equal((await expectFailure(user.call('registerPushToken', bad))).code, 'functions/invalid-argument');
  }
  assert.equal((await expectFailure(user.call('registerPushToken', { ...payload, userId: randomUUID() }))).code, 'functions/permission-denied');
  const before = (await adminDb.collection('push_tokens').where('owner_luid', '==', user.luid).get()).size;
  assert.equal(before, 0);
  const unverified = await adminAuth.createUser({ email: `${randomUUID()}@example.test` });
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const idToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: unverified.uid, user_id: unverified.uid,
    iat: now - 10, exp: now + 3600, auth_time: now - 10, email_verified: false,
    firebase: { sign_in_provider: 'password', identities: {} },
  })}.`;
  const rejected = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/registerPushToken`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: { ...payload, userId: (await import('../../lib/core.js')).luidForUid(unverified.uid) } }),
  });
  assert.equal((await rejected.json()).error.details.reason, 'identity_unverified');
});

test('account switches transfer a token once; delayed old-session cleanup cannot remove it', async () => {
  const alice = await newUser(); const bob = await newUser();
  const payload = registration(alice);
  await alice.call('registerPushToken', payload);
  const switched = { ...payload, userId: bob.luid };
  await bob.call('registerPushToken', switched);
  await alice.call('unregisterPushToken', payload);
  assert.equal((await tokenRef(payload.token).get()).get('owner_luid'), bob.luid);
  assert.equal((await expectFailure(bob.call('unregisterPushToken', payload))).code, 'functions/permission-denied');
  assert.equal((await tokenRef(payload.token).get()).exists, true);
});

test('registration rejects suspended or deleting profiles; cleanup is still allowed', async () => {
  const user = await newUser(); const payload = registration(user);
  await user.call('registerPushToken', payload);
  await adminDb.collection('profiles').doc(user.luid).update({ suspended: true });
  assert.equal((await expectFailure(user.call('registerPushToken', payload))).details.reason, 'account_suspended');
  await user.call('unregisterPushToken', payload);
  await adminDb.collection('profiles').doc(user.luid).update({ suspended: false, deleted_at: Timestamp.now() });
  assert.equal((await expectFailure(user.call('registerPushToken', payload))).details.reason, 'profile_missing');
});

test('device cap is race-safe and token rotation still works at the cap', async () => {
  const user = await newUser();
  const payloads = Array.from({ length: MAX_PUSH_DEVICES + 2 }, () => registration(user));
  const results = await Promise.allSettled(payloads.map(payload => user.call('registerPushToken', payload)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, MAX_PUSH_DEVICES);
  for (const result of results.filter(r => r.status === 'rejected')) {
    assert.equal(result.reason.code, 'functions/resource-exhausted');
    assert.equal(result.reason.details.reason, 'rate_limited');
  }
  const stored = await adminDb.collection('push_tokens').where('owner_luid', '==', user.luid).get();
  assert.equal(stored.size, MAX_PUSH_DEVICES);
  const first = payloads.find(payload => stored.docs.some(doc => doc.id === pushTokenId(payload.token)));
  await user.call('registerPushToken', { ...first, token: token() });
  assert.equal((await adminDb.collection('push_tokens').where('owner_luid', '==', user.luid).get()).size, MAX_PUSH_DEVICES);
});

test('activity fanout attempts once per device, even for concurrent/redelivered events', async () => {
  const fixture = await activityFixture();
  const extra = registration(fixture.recipient);
  await fixture.recipient.call('registerPushToken', extra);
  const sent = [];
  const send = async message => { sent.push(message); return 'fixture-message'; };
  await Promise.all([deliverActivityPush(fixture.id, send), deliverActivityPush(fixture.id, send)]);
  await deliverActivityPush(fixture.id, send);
  assert.equal(sent.length, 2);
  assert.deepEqual(new Set(sent.map(message => message.token)), new Set([fixture.payload.token, extra.token]));
  for (const message of sent) {
    assert.equal(message.data.recipient_id, fixture.recipient.luid);
    assert.equal(message.data.post_id, fixture.postId);
    assert.equal(message.data.activity_id, fixture.id);
    assert.equal(message.notification.body, 'Postun beğenildi.');
    assert.ok(!JSON.stringify(message).includes('Private text'));
    assert.match(message.apns.headers['apns-collapse-id'], /^[a-f0-9]{64}$/);
  }
});

test('push suppresses self, read, blocked, suspended, removed-post and stale-token targets', async () => {
  const fixture = await activityFixture();
  const sends = [];
  const send = async message => { sends.push(message); return 'fixture-message'; };
  await fixture.ref.update({ actor_id: fixture.recipient.luid });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await fixture.ref.update({ actor_id: fixture.actor.luid, read_at: Timestamp.now() });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await fixture.ref.update({ read_at: null });
  const block = adminDb.collection('user_blocks').doc(`${fixture.actor.luid}_${fixture.recipient.luid}`);
  await block.set({ blocker_id: fixture.actor.luid, blocked_id: fixture.recipient.luid });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await block.delete();
  const reverseBlock = adminDb.collection('user_blocks').doc(`${fixture.recipient.luid}_${fixture.actor.luid}`);
  await reverseBlock.set({ blocker_id: fixture.recipient.luid, blocked_id: fixture.actor.luid });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await reverseBlock.delete();
  await adminDb.collection('profiles').doc(fixture.recipient.luid).update({ suspended: true });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await adminDb.collection('profiles').doc(fixture.recipient.luid).update({ suspended: false });
  await adminDb.collection('posts').doc(fixture.postId).update({ status: 'removed' });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await adminDb.collection('posts').doc(fixture.postId).update({ status: 'active' });
  await adminDb.collection('profiles').doc(fixture.actor.luid).update({ deleted_at: Timestamp.now() });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await adminDb.collection('profiles').doc(fixture.actor.luid).update({ deleted_at: null });
  await fixture.ref.update({ expires_at: Timestamp.fromMillis(1) });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  await fixture.ref.update({ expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  await tokenRef(fixture.payload.token).update({ expires_at: Timestamp.fromMillis(1) });
  assert.equal(await deliverActivityPush(fixture.id, send), 0);
  assert.equal(sends.length, 0);
});

test('permanently invalid tokens are pruned, while payload/configuration failures keep valid tokens', async () => {
  const fixture = await activityFixture('comment');
  await deliverActivityPush(fixture.id, async () => { throw Object.assign(new Error('synthetic failure'), { code: 'messaging/registration-token-not-registered' }); });
  assert.equal((await tokenRef(fixture.payload.token).get()).exists, false);
  const next = await activityFixture('follow');
  await deliverActivityPush(next.id, async () => { throw Object.assign(new Error('synthetic payload error'), { code: 'messaging/invalid-argument' }); });
  assert.equal((await tokenRef(next.payload.token).get()).exists, true);
  assert.equal((await adminDb.collection('push_delivery_receipts').doc(pushDeliveryId(next.id, pushTokenId(next.payload.token))).get()).get('status'), 'failed');
});

test('late invalid-token response cannot remove a token transferred to another account', async () => {
  const fixture = await activityFixture(); const bob = await newUser();
  await deliverActivityPush(fixture.id, async () => {
    await bob.call('registerPushToken', { ...fixture.payload, userId: bob.luid });
    throw Object.assign(new Error('synthetic stale failure'), { code: 'messaging/invalid-registration-token' });
  });
  assert.equal((await tokenRef(fixture.payload.token).get()).get('owner_luid'), bob.luid);
});

test('unregistration and account deletion stop delivery and remove registration/receipt data', async () => {
  const first = await activityFixture();
  await first.recipient.call('unregisterPushToken', first.payload);
  assert.equal(await deliverActivityPush(first.id, async () => { throw new Error('must not send'); }), 0);
  const second = await activityFixture();
  await deliverActivityPush(second.id, async () => 'fixture-message');
  await second.recipient.call('deleteAccount', {});
  assert.equal((await adminDb.collection('push_tokens').where('owner_luid', '==', second.recipient.luid).get()).empty, true);
  assert.equal((await adminDb.collection('push_delivery_receipts').where('owner_luid', '==', second.recipient.luid).get()).empty, true);
  assert.equal(await deliverActivityPush(second.id, async () => { throw new Error('must not send'); }), 0);
});

test('concurrent social-trigger redelivery creates one activity and preserves its read status', async () => {
  const owner = await newUser(); const actor = await newUser(); const postId = randomUUID();
  await adminDb.collection('posts').doc(postId).set({ creator_id: owner.luid, status: 'active', visibility: 'public', likes_count: 0, engagement_score: 0 });
  await adminDb.collection('likes').doc(`${postId}_${actor.luid}`).set({ post_id: postId, user_id: actor.luid });
  const id = `like_${postId}_${actor.luid}`;
  const event = { id: `fixture-like-${randomUUID()}`, data: { data: () => ({ post_id: postId, user_id: actor.luid }) } };
  await Promise.all([onLikeCreated.run(event), onLikeCreated.run(event)]);
  const ref = adminDb.collection('activity_events').doc(id);
  assert.equal((await ref.get()).get('recipient_id'), owner.luid);
  const readAt = Timestamp.now(); await ref.update({ read_at: readAt });
  await onLikeCreated.run(event);
  assert.equal((await ref.get()).get('read_at').toMillis(), readAt.toMillis());
  assert.equal((await adminDb.collection('posts').doc(postId).get()).get('likes_count'), 1);
});
