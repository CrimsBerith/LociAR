import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import test, { before, after } from 'node:test';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// The Auth emulator accepts unsigned JWT fixtures. This tests claim enforcement,
// not the live TOTP challenge or Google's production JWT signature verification.
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.ok(existsSync('.next/BUILD_ID'), 'Run npm run build:ci before admin integration tests');
initializeApp({ projectId: 'demo-lociar' });
const auth = getAuth();
const db = getFirestore();
let server, origin, output = '';

before(async () => {
  const allocator = createServer();
  allocator.listen(0, '127.0.0.1'); await once(allocator, 'listening');
  const port = allocator.address().port;
  await new Promise(resolve => allocator.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, NODE_ENV: 'production', GCLOUD_PROJECT: 'demo-lociar', GOOGLE_CLOUD_PROJECT: 'demo-lociar', ADMIN_ORIGIN: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next server exited: ${output}`);
    try { if ((await fetch(`${origin}/admin/login`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Next server did not become ready: ${output}`);
});
after(async () => {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  await Promise.all(getApps().map(deleteApp));
});

async function identity(role, mfa = true) {
  const uid = randomUUID();
  await auth.createUser({ uid, email: `ci-${uid}@example.test`, emailVerified: true });
  if (role) await db.collection('admin_role_assignments').doc(`${uid}_${role}`).set({ user_id: uid, role_key: role, revoked_at: null });
  return { uid, mfa };
}
function idToken(user, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'https://securetoken.google.com/demo-lociar', aud: 'demo-lociar', sub: user.uid, user_id: user.uid,
    iat: now, exp: now + 3600, auth_time: now, email: `ci-${user.uid}@example.test`, email_verified: true,
    firebase: { identities: {}, sign_in_provider: 'password', ...(user.mfa ? { sign_in_second_factor: 'totp' } : {}) }, ...overrides };
  return [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), ''].join('.');
}
async function post(path, data, cookie, headers = {}) {
  return fetch(origin + path, { method: 'POST', redirect: 'manual', headers: {
    origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers,
  }, body: JSON.stringify(data) });
}
async function session(user) {
  const response = await post('/api/auth/session', { idToken: idToken(user) });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie?.startsWith('__session='));
  return { cookie: cookie.split(';')[0], response };
}
function actionPath(id) { return `/api/admin/v1/posts/${id}/moderate`; }
const reason = 'Integration security verification';

test('session creation rejects malformed JSON, stale sign-in and users without an active known role', async () => {
  for (const body of [null, [], 42]) assert.equal((await post('/api/auth/session', body)).status, 400);
  const ordinary = await identity(null);
  assert.equal((await post('/api/auth/session', { idToken: idToken(ordinary) })).status, 403);
  const unknown = await identity('unknown_admin_role');
  assert.equal((await post('/api/auth/session', { idToken: idToken(unknown) })).status, 403);
  const admin = await identity('super_admin');
  const stale = await post('/api/auth/session', { idToken: idToken(admin, { auth_time: Math.floor(Date.now() / 1000) - 301 }) });
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).reason, 'stale_sign_in');
});
test('session cookie is HttpOnly, Secure, SameSite Strict and sign-in creates an audit record', async () => {
  const admin = await identity('super_admin');
  const { response } = await session(admin);
  const header = response.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/']) assert.ok(header.toLowerCase().includes(flag.toLowerCase()));
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).redirect, '/admin/dashboard');
  const audits = await db.collection('admin_audit_log').where('actor_id', '==', admin.uid).get();
  assert.ok(audits.docs.some(doc => doc.get('action') === 'admin_sign_in'));
});
test('API rejects missing sessions, AAL1 and an AAL2 role without the operation permission', async () => {
  const postId = randomUUID();
  await db.collection('posts').doc(postId).set({ status: 'pending_review', deleted_at: null, age_rating: 'all' });
  const headers = { 'idempotency-key': randomUUID() };
  assert.equal((await post(actionPath(postId), { action: 'approve', reason }, null, headers)).status, 401);
  const aal1 = await session(await identity('super_admin', false));
  assert.equal((await aal1.response.json()).redirect, '/admin/mfa');
  const mfaFailure = await post(actionPath(postId), { action: 'approve', reason }, aal1.cookie, headers);
  assert.equal(mfaFailure.status, 403); assert.match((await mfaFailure.json()).error, /MFA/);
  const observer = await session(await identity('engineering_observer'));
  const permissionFailure = await post(actionPath(postId), { action: 'approve', reason }, observer.cookie, headers);
  assert.equal(permissionFailure.status, 403); assert.match((await permissionFailure.json()).error, /posts.moderate/);
  assert.equal((await db.collection('posts').doc(postId).get()).get('status'), 'pending_review');
});
test('moderation through the real HTTP route updates once, audits once, rejects foreign origins and bad payloads', async () => {
  const admin = await identity('trust_safety_admin'); const { cookie } = await session(admin);
  const postId = randomUUID(); const ref = db.collection('posts').doc(postId);
  await ref.set({ status: 'pending_review', deleted_at: null, age_rating: 'all' });
  const key = randomUUID(); const headers = { 'idempotency-key': key };
  for (let i = 0; i < 2; i++) assert.equal((await post(actionPath(postId), { action: 'approve', reason }, cookie, headers)).status, 200);
  assert.equal((await ref.get()).get('status'), 'active');
  const audit = await db.collection('admin_audit_log').doc(key).get();
  assert.equal(audit.get('actor_id'), admin.uid); assert.equal(audit.get('resource_id'), postId);
  assert.equal((await post(actionPath(postId), { action: 'soft_delete', reason }, cookie, { ...headers, origin: 'https://attacker.invalid' })).status, 403);
  for (const body of [null, [], { action: 'approve', reason: 'short' }]) assert.equal((await post(actionPath(postId), body, cookie, { 'idempotency-key': randomUUID() })).status, 400);
  assert.equal((await ref.get()).get('status'), 'active');
});
test('revoked role assignments and expired session cookies stop access immediately', async () => {
  const admin = await identity('super_admin'); const { cookie } = await session(admin);
  await db.collection('admin_role_assignments').doc(`${admin.uid}_super_admin`).update({ revoked_at: Timestamp.now() });
  assert.equal((await post(actionPath(randomUUID()), { action: 'approve', reason }, cookie)).status, 401);
  const other = await identity('super_admin'); const valid = await session(other);
  const token = valid.cookie.slice('__session='.length); const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url')); payload.exp = Math.floor(Date.now() / 1000) - 1;
  parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.equal((await post(actionPath(randomUUID()), { action: 'approve', reason }, `__session=${parts.join('.')}`)).status, 401);
});
test('signout revokes the captured session and clears the cookie', async () => {
  const admin = await identity('super_admin'); const { cookie } = await session(admin);
  // Firebase revocation timestamps have one-second precision; wait to cross that boundary.
  await new Promise(resolve => setTimeout(resolve, 1100));
  const response = await post('/api/auth/signout', {}, cookie);
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
  assert.equal((await post(actionPath(randomUUID()), { action: 'approve', reason }, cookie)).status, 401);
});
test('protected pages redirect AAL1 to MFA and permissionless AAL2 to unauthorized', async () => {
  const aal1 = await session(await identity('super_admin', false));
  const observer = await session(await identity('engineering_observer'));
  for (const [cookie, destination] of [[aal1.cookie, '/admin/mfa'], [observer.cookie, '/admin/unauthorized']]) {
    const response = await fetch(origin + '/admin/posts', { headers: { cookie }, redirect: 'manual' });
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get('location'), origin).pathname, destination);
  }
});

test('approval HTTP flow requires a second admin and atomically applies the approved metrics', async () => {
  const requester = await identity('super_admin'); const reviewer = await identity('super_admin');
  const first = await session(requester); const second = await session(reviewer);
  const id = randomUUID(); const postRef = db.collection('posts').doc(id);
  await postRef.set({ status: 'active', views_count: 1, likes_count: 2, comments_count: 3, updated_at: Timestamp.now() });
  const key = randomUUID();
  const request = { action: 'post_metrics_set', resourceType: 'post', resourceId: id, reason,
    payload: { viewsCount: 20, likesCount: 30, commentsCount: 40 } };
  const created = await post('/api/admin/v1/approvals', request, first.cookie, { 'idempotency-key': key });
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const replay = await post('/api/admin/v1/approvals', request, first.cookie, { 'idempotency-key': key });
  assert.equal(replay.status, 200); assert.equal((await replay.json()).idempotent, true);
  const path = `/api/admin/v1/approvals/${key}/decision`;
  const self = await post(path, { decision: 'approved', reason }, first.cookie, { 'idempotency-key': randomUUID() });
  assert.equal(self.status, 409); assert.match((await self.json()).error, /self_approval_forbidden/);
  assert.equal((await postRef.get()).get('likes_count'), 2);
  const approved = await post(path, { decision: 'approved', reason }, second.cookie, { 'idempotency-key': randomUUID() });
  assert.equal(approved.status, 200); assert.equal((await postRef.get()).get('likes_count'), 30);
  assert.equal((await db.collection('admin_approval_requests').doc(key).get()).get('status'), 'approved');
});
test('rate-limited HTTP actions return 429 with no post mutation', async () => {
  const admin = await identity('trust_safety_admin'); const { cookie } = await session(admin);
  const id = randomUUID(); const ref = db.collection('posts').doc(id);
  await ref.set({ status: 'pending_review', age_rating: 'all', deleted_at: null });
  const bucket = Math.floor(Date.now() / 1000 / 60);
  // Seed both adjacent buckets so crossing a minute during this assertion is deterministic.
  for (const window of [bucket, bucket + 1]) {
    await db.collection('admin_rate_limits').doc(`${admin.uid}_posts.moderate_${window}`).set({ count: 30 });
  }
  const response = await post(actionPath(id), { action: 'approve', reason }, cookie, { 'idempotency-key': randomUUID() });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
  assert.equal((await ref.get()).get('status'), 'pending_review');
});

async function regularInvite(user, roleKey = null) {
  const ref = db.collection('admin_user_invites').doc(randomUUID());
  await ref.set({ email: `ci-${user.uid}@example.test`, invited_user_id: user.uid, invited_by: randomUUID(),
    requested_role_key: roleKey, status: 'sent', created_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + 3_600_000) });
  return ref;
}

test('regular-user invitation HTTP acceptance is verified, replayable and never creates an admin cookie or role', async () => {
  const user = await identity(null); const invite = await regularInvite(user);
  for (let i = 0; i < 2; i++) {
    const response = await post('/api/auth/invite', { idToken: idToken(user), inviteId: invite.id });
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await response.json()).ok, true); assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await invite.get()).get('status'), 'accepted');
  assert.equal((await db.collection('admin_role_assignments').where('user_id', '==', user.uid).get()).empty, true);
  assert.equal((await post('/api/auth/session', { idToken: idToken(user) })).status, 403);
});

test('regular-user invitation HTTP rejects stale/unverified/wrong-user tokens, foreign origins and admin invitations', async () => {
  const user = await identity(null); const other = await identity(null); const invite = await regularInvite(user);
  assert.equal((await post('/api/auth/invite', null)).status, 400);
  assert.equal((await post('/api/auth/invite', { idToken: idToken(user), inviteId: '../escape' })).status, 400);
  const data = { idToken: idToken(user), inviteId: invite.id };
  assert.equal((await post('/api/auth/invite', data, null, { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await post('/api/auth/invite', { ...data, idToken: idToken(user, { auth_time: Math.floor(Date.now() / 1000) - 301 }) })).status, 401);
  assert.equal((await post('/api/auth/invite', { ...data, idToken: idToken(user, { email_verified: false }) })).status, 403);
  assert.equal((await post('/api/auth/invite', { ...data, idToken: idToken(other) })).status, 403);
  assert.equal((await invite.get()).get('status'), 'sent');
  const adminInvite = await regularInvite(user, 'analyst');
  const forbidden = await post('/api/auth/invite', { ...data, inviteId: adminInvite.id });
  assert.equal(forbidden.status, 403); assert.equal((await forbidden.json()).reason, 'admin_invite_requires_admin_sign_in');
  assert.equal((await db.collection('admin_role_assignments').where('user_id', '==', user.uid).get()).empty, true);
  assert.equal((await adminInvite.get()).get('status'), 'sent');
});


test('audited zone creation returns an ID accepted by the toggle route, and permission/origin still apply', async () => {
  const { cookie } = await session(await identity('super_admin'));
  const key = randomUUID();
  const payload = { name: 'HTTP regression school', category: 'school', lat: 41, lng: 29, radius_meters: 150, reason };
  const create = await post('/api/admin/v1/zones', payload, cookie, { 'idempotency-key': key });
  assert.equal(create.status, 200, JSON.stringify(await create.clone().json()));
  const { id } = await create.json();
  const retry = await post('/api/admin/v1/zones', payload, cookie, { 'idempotency-key': key });
  assert.deepEqual(await retry.json(), { id });
  const toggle = await post(`/api/admin/v1/zones/${id}/active`, { active: false, reason }, cookie, { 'idempotency-key': randomUUID() });
  assert.equal(toggle.status, 200, JSON.stringify(await toggle.clone().json()));
  assert.equal((await db.collection('protected_zones').doc(id).get()).get('active'), false);
  assert.equal((await post('/api/admin/v1/zones', { ...payload, lat: null }, cookie, { 'idempotency-key': randomUUID() })).status, 400);
  const support = await session(await identity('support_agent'));
  assert.equal((await post('/api/admin/v1/zones', payload, support.cookie, { 'idempotency-key': randomUUID() })).status, 403);
  assert.equal((await post('/api/admin/v1/zones', payload, cookie, { 'idempotency-key': randomUUID(), origin: 'https://foreign.example' })).status, 403);
});
