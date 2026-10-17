import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { requestAdminEmailCode: request, verifyAdminEmailCode: verify, readAdminEmailSession: read,
  revokeAdminEmailSession: revoke, sendAdminCode, EmailDeliveryError, EmailRateLimitError } = await import('../../lib/admin-email-auth.ts');
const { getAdminContextForSession: getAdminContext } = await import('../../lib/admin-session.ts');
const db = getFirestore(), auth = getAuth();
after(() => Promise.all(getApps().map(deleteApp)));
const hash = s => createHash('sha256').update(s).digest('hex');
async function fixture(role = 'super_admin') {
  const uid = randomUUID(), email = `email-code-${uid}@example.test`;
  await auth.createUser({ uid, email });
  const roleRef = db.collection('admin_role_assignments').doc(uid);
  if (role) await roleRef.set({ user_id: uid, role_key: role, revoked_at: null });
  const sent = [], send = async (to, code, id) => { sent.push({ to, code, id }); };
  return { uid, email, roleRef, sent, send, source: randomUUID(), now: Date.now() };
}
async function challenge(f, now = f.now) { return request(f.email, f.source, f.send, now); }

test('six-digit code creates an opaque hashed eight-hour session, records the true method and preserves RBAC', async () => {
  const f = await fixture('engineering_observer'), cookie = await challenge(f);
  assert.equal(f.sent.length, 1); assert.match(f.sent[0].code, /^[0-9]{6}$/);
  const rawChallenge = (await db.collection('admin_email_challenges').doc(hash(f.email)).get()).data();
  assert.equal(rawChallenge.code, undefined); assert.notEqual(rawChallenge.code_hash, f.sent[0].code);
  const session = await verify(cookie, f.sent[0].code, f.now + 10);
  assert.match(session, /^email1\.[0-9a-f]{64}$/);
  assert.equal((await db.collection('admin_email_sessions').doc(session).get()).exists, false);
  const record = (await db.collection('admin_email_sessions').doc(hash(session)).get()).data();
  assert.equal(record.expires_at.toMillis() - record.authenticated_at.toMillis(), 8 * 3600_000);
  assert.equal((await read(session, f.now + 20)).uid, f.uid);
  const context = await getAdminContext(session);
  assert.equal(context.assuranceLevel, 'email_code');
  assert.equal(context.permissions.has('notifications.send'), false);
  const audits = await db.collection('admin_audit_log').where('actor_id', '==', f.uid).get();
  assert.equal(audits.size, 1); assert.deepEqual(audits.docs[0].get('after_state'), { method: 'email_code', secondFactor: false });
});

test('unknown, ordinary and disabled accounts receive no mail and cannot obtain a session', async () => {
  const f = await fixture(null);
  for (const email of [f.email, `unknown-${randomUUID()}@example.test`]) {
    const cookie = await request(email, f.source, f.send, f.now);
    assert.match(cookie, /^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    assert.equal(await verify(cookie, '123456', f.now), null);
  }
  const admin = await fixture(); await auth.updateUser(admin.uid, { disabled: true });
  await challenge(admin); assert.equal(admin.sent.length, 0); assert.equal(f.sent.length, 0);
});

test('challenge is browser-bound, expires after ten minutes and locks after five wrong guesses', async () => {
  const f = await fixture(), cookie = await challenge(f), code = f.sent[0].code;
  const swapped = cookie.split('.')[0] + '.' + 'f'.repeat(64);
  assert.equal(await verify(swapped, code, f.now), null);
  assert.equal(await verify(cookie, code, f.now + 600_000), null);
  const wrong = code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) assert.equal(await verify(cookie, wrong, f.now + 1), null);
  assert.equal(await verify(cookie, code, f.now + 2), null);
});

test('concurrent verification consumes the code exactly once and replay never creates another session', async () => {
  const f = await fixture(), cookie = await challenge(f);
  const results = await Promise.all([verify(cookie, f.sent[0].code), verify(cookie, f.sent[0].code)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await verify(cookie, f.sent[0].code), null);
  assert.equal((await db.collection('admin_email_sessions').where('uid', '==', f.uid).get()).size, 1);
});

test('resends enforce cooldown and invalidate the old browser challenge, even with its correct code', async () => {
  const f = await fixture(), first = await challenge(f), oldCode = f.sent[0].code;
  await assert.rejects(challenge(f, f.now + 59_999), EmailRateLimitError);
  const second = await challenge(f, f.now + 61_000);
  assert.equal(await verify(first, oldCode, f.now + 61_001), null);
  assert.ok(await verify(second, f.sent[1].code, f.now + 61_001));
});

test('mail failures leave no usable challenge; there is no success before the sender accepts the request', async () => {
  const f = await fixture(); let captured;
  await assert.rejects(request(f.email, f.source, async (_, code) => {
    captured = code;
    // The browser verifier is not stored; even a captured correct code cannot authenticate here.
    assert.equal((await db.collection('admin_email_challenges').doc(hash(f.email)).get()).get('ready'), false);
    throw new Error('provider response with sensitive data');
  }, f.now), EmailDeliveryError);
  const stored = (await db.collection('admin_email_challenges').doc(hash(f.email)).get()).data();
  assert.equal(stored.ready, false); assert.equal(stored.code_hash, null); assert.match(captured, /^\d{6}$/);
});

test('hourly send limits apply even when addresses are not administrators', async () => {
  const f = await fixture(null);
  f.now = (Math.floor(f.now / 3_600_000) + 1) * 3_600_000;
  for (let i = 0; i < 5; i++) await challenge(f, f.now + i * 61_000);
  await assert.rejects(challenge(f, f.now + 5 * 61_000), EmailRateLimitError);
  assert.equal(f.sent.length, 0);
});

test('role revocation, deletion and email changes fence pending codes and existing sessions', async () => {
  for (const change of ['role', 'deletion', 'email', 'disabled']) {
    const f = await fixture(), cookie = await challenge(f);
    const second = await fixture(), session = await verify(await challenge(second), second.sent[0].code);
    async function apply(user) {
      if (change === 'role') await user.roleRef.update({ revoked_at: Timestamp.now() });
      if (change === 'disabled') await auth.updateUser(user.uid, { disabled: true });
      if (change === 'email') await auth.updateUser(user.uid, { email: `changed-${user.email}` });
      if (change === 'deletion') {
        const { luidForUid } = await import('../../lib/account-lifecycle.ts');
        await db.collection('account_deletion_jobs').doc(luidForUid(user.uid)).set({ status: 'deleting' });
      }
    }
    await apply(f); await apply(second);
    assert.equal(await verify(cookie, f.sent[0].code), null, change);
    assert.equal(await getAdminContext(session), null, change);
  }
});

test('expired, revoked and malformed sessions are rejected', async () => {
  const f = await fixture(), session = await verify(await challenge(f), f.sent[0].code, f.now);
  assert.equal(await read(session, f.now + 8 * 3600_000), null);
  assert.equal(await read('email1.guessed'), null);
  await revoke(session); assert.equal(await getAdminContext(session), null);
});

test('Firebase token revocation fences both a pending code and a previously created email session', async () => {
  const f = await fixture(), cookie = await challenge(f);
  const other = await fixture(), session = await verify(await challenge(other), other.sent[0].code);
  await new Promise(resolve => setTimeout(resolve, 1100)); // Firebase revocation is recorded to whole seconds.
  await auth.revokeRefreshTokens(f.uid); await auth.revokeRefreshTokens(other.uid);
  assert.equal(await verify(cookie, f.sent[0].code), null);
  assert.equal(await read(session), null);
});

test('sender uses only the fixed HTTPS provider, is bounded and never exposes provider errors', async t => {
  const previous = { key: process.env.ADMIN_EMAIL_API_KEY, from: process.env.ADMIN_EMAIL_FROM };
  t.after(() => {
    for (const [env, value] of [['ADMIN_EMAIL_API_KEY', previous.key], ['ADMIN_EMAIL_FROM', previous.from]]) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
  });
  delete process.env.ADMIN_EMAIL_API_KEY;
  await assert.rejects(sendAdminCode('admin@example.test', '123456', randomUUID()), EmailDeliveryError);
  process.env.ADMIN_EMAIL_API_KEY = 'fake-api-key'; process.env.ADMIN_EMAIL_FROM = 'LociAR <onboarding@resend.dev>';
  const calls = [];
  const stub = t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return new Response('{"id":"synthetic-message-id"}', { status: 200 }); });
  await sendAdminCode('admin@example.test', '123456', 'request-id');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'request-id');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['admin@example.test']);
  stub.mock.mockImplementation(async () => new Response('{}', { status: 200 }));
  await assert.rejects(sendAdminCode('admin@example.test', '123456', 'request-id'), EmailDeliveryError);
  stub.mock.mockImplementation(async () => new Response('sensitive provider error', { status: 403 }));
  await assert.rejects(sendAdminCode('admin@example.test', '123456', 'request-id'), e => e instanceof EmailDeliveryError && !e.message.includes('sensitive'));
});
