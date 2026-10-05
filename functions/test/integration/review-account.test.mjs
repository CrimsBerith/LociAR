import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { adminAuth, adminDb, closeClients, PROJECT } from './_harness.mjs';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Review-account integration tests require Auth and Firestore emulators.');
}
after(closeClients);
const execute = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/provision-review-account.mjs', import.meta.url));
const rotationScript = fileURLToPath(new URL('../../scripts/rotate-account-password.mjs', import.meta.url));

test('review account provisioning creates and rotates private credentials without console disclosure', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lociar-review-account-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const provision = async name => {
    const filePath = join(directory, name);
    const env = { ...process.env, FIREBASE_PROJECT_ID: PROJECT, REVIEW_CREDENTIALS_FILE: filePath };
    const { stdout, stderr } = await execute(process.execPath, [script], { env, timeout: 30_000 });
    const credentials = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(statSync(filePath).mode & 0o777, 0o600);
    assert.ok(!`${stdout}${stderr}`.includes(credentials.password));
    assert.match(stdout, /Provisioning complete/);
    return { credentials, filePath, env };
  };
  const signIn = async ({ email, password }) => {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return { status: response.status, body: await response.json() };
  };

  const first = await provision('first.json');
  assert.equal((await signIn(first.credentials)).status, 200);
  const user = await adminAuth.getUserByEmail(first.credentials.email);
  t.after(async () => {
    await Promise.all([
      adminDb.collection('handles').doc('apple_review').delete(),
      adminDb.collection('profiles').doc(user.customClaims.luid).delete(),
      adminDb.collection('users_private').doc(user.customClaims.luid).delete(),
    ]);
    await adminAuth.deleteUser(user.uid);
  });
  assert.equal(user.emailVerified, true);
  const profile = await adminDb.collection('profiles').doc(user.customClaims.luid).get();
  assert.equal(profile.get('handle'), 'apple_review');

  const second = await provision('second.json');
  assert.notEqual(first.credentials.password, second.credentials.password);
  assert.equal((await signIn(second.credentials)).status, 200);
  assert.notEqual((await signIn(first.credentials)).status, 200);
  assert.equal((await adminAuth.getUserByEmail(first.credentials.email)).uid, user.uid);
  await assert.rejects(execute(process.execPath, [script], { env: second.env, timeout: 30_000 }), error => {
    assert.ok(!`${error.stdout}${error.stderr}`.includes(second.credentials.password));
    return true;
  });
  assert.equal((await signIn(second.credentials)).status, 200, 'existing output must stop provisioning before another rotation');
});

test('existing account password rotation revokes sessions and preserves custom claims and profile data', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lociar-account-rotation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const email = `ci-${randomUUID()}@example.test`;
  const oldPassword = randomBytes(32).toString('base64url');
  const user = await adminAuth.createUser({ email, password: oldPassword, emailVerified: true });
  t.after(() => adminAuth.deleteUser(user.uid));
  const claims = { luid: randomUUID(), integration_marker: 'preserve' };
  await adminAuth.setCustomUserClaims(user.uid, claims);
  const profile = adminDb.collection('profiles').doc(claims.luid);
  await profile.set({ handle: 'rotation_fixture', deleted_at: null, suspended_at: null, follower_count: 7 });
  t.after(() => profile.delete());
  const before = (await profile.get()).data();
  const signIn = async password => {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return { status: response.status, body: await response.json() };
  };
  const oldSession = await signIn(oldPassword);
  assert.equal(oldSession.status, 200);
  await new Promise(resolve => setTimeout(resolve, 1100)); // Auth revocation has one-second precision.
  const file = join(directory, 'rotation.json');
  const env = { ...process.env, FIREBASE_PROJECT_ID: PROJECT, ACCOUNT_EMAIL: email, REVIEW_CREDENTIALS_FILE: file };
  const { stdout, stderr } = await execute(process.execPath, [rotationScript], { env, timeout: 30_000 });
  const credentials = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(!`${stdout}${stderr}`.includes(credentials.password));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.notEqual((await signIn(oldPassword)).status, 200);
  assert.equal((await signIn(credentials.password)).status, 200);
  await assert.rejects(adminAuth.verifyIdToken(oldSession.body.idToken, true), { code: 'auth/id-token-revoked' });
  assert.deepEqual((await adminAuth.getUser(user.uid)).customClaims, claims);
  assert.deepEqual((await profile.get()).data(), before);
  await assert.rejects(execute(process.execPath, [rotationScript], { env, timeout: 30_000 }));
  assert.equal((await signIn(credentials.password)).status, 200, 'existing output must stop before another rotation');
});

test('rotation of a missing existing account does not create a replacement identity', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lociar-missing-account-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const email = `ci-missing-${randomUUID()}@example.test`;
  await assert.rejects(execute(process.execPath, [rotationScript], {
    env: { ...process.env, FIREBASE_PROJECT_ID: PROJECT, ACCOUNT_EMAIL: email, REVIEW_CREDENTIALS_FILE: join(directory, 'missing.json') }, timeout: 30_000,
  }));
  await assert.rejects(adminAuth.getUserByEmail(email), { code: 'auth/user-not-found' });
});
