import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import test, { before, after } from 'node:test';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { chromium, expect } from '@playwright/test';

// No live credentials: all browser mutations use a demo project and local Auth/Firestore.
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.ok(existsSync('.next/BUILD_ID'), 'Run npm run build:ci before admin integration tests');
initializeApp({ projectId: 'demo-lociar' });
const auth = getAuth(); const db = getFirestore();
let server, browser, origin, output = '';
const reason = 'Browser integration verification';

before(async () => {
  const allocator = createServer(); allocator.listen(0, '127.0.0.1'); await once(allocator, 'listening');
  const port = allocator.address().port; await new Promise(resolve => allocator.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, NODE_ENV: 'production', GCLOUD_PROJECT: 'demo-lociar', GOOGLE_CLOUD_PROJECT: 'demo-lociar', ADMIN_ORIGIN: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next server exited: ${output}`);
    try { if ((await fetch(`${origin}/admin/login`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok((await fetch(`${origin}/admin/login`)).ok, `Next server did not become ready: ${output}`);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  await Promise.all(getApps().map(deleteApp));
});

async function administrator(role = 'super_admin') {
  const uid = randomUUID(); const email = `browser-${uid}@example.test`;
  await auth.createUser({ uid, email, emailVerified: true });
  await db.collection('admin_role_assignments').doc(`${uid}_${role}`).set({ user_id: uid, role_key: role, revoked_at: null });
  const now = Math.floor(Date.now() / 1000);
  // Auth emulator unsigned JWTs test claim enforcement, not live MFA or signature verification.
  const claims = { iss: 'https://securetoken.google.com/demo-lociar', aud: 'demo-lociar', sub: uid, user_id: uid,
    iat: now, exp: now + 3600, auth_time: now, email, email_verified: true,
    firebase: { identities: {}, sign_in_provider: 'password', sign_in_second_factor: 'totp' } };
  const idToken = [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'), ''].join('.');
  const response = await fetch(origin + '/api/auth/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
  assert.equal(response.status, 200);
  return { uid, role, cookie: response.headers.get('set-cookie').split(';')[0].slice('__session='.length) };
}

async function browserFlow(t, admin, callback, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  if (admin) await context.addCookies([{ name: '__session', value: admin.cookie, url: origin, httpOnly: true, secure: true, sameSite: 'Strict' }]);
  // The production Firebase browser SDK is exercised unchanged; only these test requests
  // are forwarded to the Auth emulator. No Google service receives a CI identity or mutation.
  await context.route(/^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, async route => {
    const request = route.request(); const url = new URL(request.url());
    const target = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/${url.hostname}${url.pathname}${url.search}`;
    const response = await route.fetch({ url: target });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': origin } });
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);
  page.on('dialog', dialog => dialog.accept(reason));
  // Fail before Node's outer timeout so a stalled action still leaves a trace.
  try { await withinDeadline(callback(page, context), 80_000, 'Browser flow'); }
  catch (error) {
    const slug = t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100);
    mkdirSync('artifacts/playwright-emulator', { recursive: true });
    await page.screenshot({ path: `artifacts/playwright-emulator/${slug}.png`, fullPage: true, timeout: 5000 }).catch(() => {});
    await withinDeadline(context.tracing.stop({ path: `artifacts/playwright-emulator/${slug}.zip` }), 10_000, 'Failure trace').catch(() => {});
    throw error;
  } finally { await withinDeadline(context.close(), 10_000, 'Browser context cleanup'); }
}

async function withinDeadline(operation, timeout, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeout}ms`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

async function postFixture(caption) {
  const ref = db.collection('posts').doc(randomUUID());
  await ref.set({ caption, status: 'pending_review', deleted_at: null, age_rating: 'all', visibility: 'public',
    created_at: Timestamp.now(), updated_at: Timestamp.now(), views_count: 1, likes_count: 2, comments_count: 3 });
  return ref;
}
function postRow(page, ref) { return page.locator('.dataRow.post').filter({ hasText: ref.id }); }

test('Chromium moderation retries an interrupted committed request with one audit and resets the buttons', { timeout: 120_000 }, async t => {
  const admin = await administrator('trust_safety_admin'); const ref = await postFixture(`browser-moderation-${randomUUID()}`);
  await browserFlow(t, admin, async page => {
    await page.goto(origin + '/admin/posts'); const row = postRow(page, ref);
    await row.getByRole('button', { name: 'Manage', exact: true }).click();
    const keys = []; let interrupted = false;
    await page.route(`**/api/admin/v1/posts/${ref.id}/moderate`, async route => {
      keys.push(route.request().headers()['idempotency-key']);
      if (!interrupted) { interrupted = true; await route.fetch(); await route.abort('failed'); }
      else await route.continue();
    });
    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(row.getByRole('status')).toContainText('connection was interrupted');
    await expect(row.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await ref.get()).get('status')).toBe('active');
    await expect(row).toContainText('active');
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    const audits = await db.collection('admin_audit_log').where('resource_id', '==', ref.id).get();
    assert.equal(audits.docs.filter(doc => doc.get('action') === 'post_approve').length, 1);
  });
});

test('Chromium metrics form recovers from a non-JSON response and submits its real counters', { timeout: 120_000 }, async t => {
  const admin = await administrator();
  const ref = await postFixture(`browser-metrics-${randomUUID()}`);
  await browserFlow(t, admin, async page => {
    await page.goto(origin + '/admin/posts'); const row = postRow(page, ref);
    await row.getByRole('button', { name: 'Manage', exact: true }).click();
    await row.getByLabel('Views', { exact: true }).fill('25');
    await row.getByLabel('Reason', { exact: true }).fill(reason);
    let failed = false; const keys = [];
    await page.route(`**/api/admin/v1/posts/${ref.id}/metrics`, async route => {
      keys.push(route.request().headers()['idempotency-key']);
      if (!failed) { failed = true; await route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Gateway error</h1>' }); }
      else await route.continue();
    });
    await row.getByRole('button', { name: 'Set raw counters' }).click();
    await expect(row.getByRole('status')).toContainText('response could not be confirmed');
    await expect(row.getByRole('button', { name: 'Set raw counters' })).toBeEnabled();
    await row.getByRole('button', { name: 'Set raw counters' }).click();
    await expect.poll(async () => (await ref.get()).get('views_count')).toBe(25);
    assert.equal(keys[0], keys[1]); assert.equal((await ref.get()).get('engagement_score'), 46);
  });
});

test('Chromium large metric edits require a different admin; approval form recovers from network failure', { timeout: 120_000 }, async t => {
  t.diagnostic('approval: create administrators');
  const requester = await administrator(); const reviewer = await administrator(); const ref = await postFixture(`browser-approval-${randomUUID()}`);
  let approvalId;
  await browserFlow(t, requester, async page => {
    t.diagnostic('approval: requester navigation');
    await page.goto(origin + '/admin/posts'); const row = postRow(page, ref);
    await row.getByRole('button', { name: 'Manage', exact: true }).click();
    await row.getByLabel('Views', { exact: true }).fill('20000'); await row.getByLabel('Reason', { exact: true }).fill(reason);
    await row.getByRole('button', { name: 'Set raw counters' }).click();
    t.diagnostic('approval: requester submitted');
    await expect(row.getByRole('status')).toContainText('independent approval');
    const approvals = await db.collection('admin_approval_requests').where('resource_id', '==', ref.id).get();
    assert.equal(approvals.size, 1); approvalId = approvals.docs[0].id;
    assert.equal((await ref.get()).get('views_count'), 1);
    await page.goto(origin + '/admin/approvals');
    t.diagnostic('approval: requester approvals loaded');
    await expect(page.locator('.dataRow.post').filter({ hasText: approvalId })).toContainText('Independent admin required');
  });
  t.diagnostic('approval: requester context closed');
  await browserFlow(t, reviewer, async page => {
    t.diagnostic('approval: reviewer navigation');
    await page.goto(origin + '/admin/approvals'); const row = page.locator('.dataRow.post').filter({ hasText: approvalId });
    let failed = false; const keys = [];
    await page.route(`**/api/admin/v1/approvals/${approvalId}/decision`, async route => {
      keys.push(route.request().headers()['idempotency-key']);
      if (!failed) { failed = true; await route.abort('failed'); } else await route.continue();
    });
    await row.getByRole('button', { name: 'Approve & execute' }).click();
    t.diagnostic('approval: reviewer first click');
    await expect(row.getByRole('status')).toContainText('connection was interrupted');
    await expect(row.getByRole('button', { name: 'Approve & execute' })).toBeEnabled();
    await row.getByRole('button', { name: 'Approve & execute' }).click();
    t.diagnostic('approval: reviewer retry click');
    await expect.poll(async () => (await ref.get()).get('views_count')).toBe(20000);
    assert.equal(keys[0], keys[1]);
    assert.equal((await db.collection('admin_approval_requests').doc(approvalId).get()).get('decided_by'), reviewer.uid);
  });
  t.diagnostic('approval: reviewer context closed');
});

test('Chromium immediately rejects a revoked administrator role on the open moderation form', { timeout: 120_000 }, async t => {
  const admin = await administrator('trust_safety_admin'); const ref = await postFixture(`browser-revoked-${randomUUID()}`);
  await browserFlow(t, admin, async page => {
    await page.goto(origin + '/admin/posts'); const row = postRow(page, ref);
    await row.getByRole('button', { name: 'Manage', exact: true }).click();
    await db.collection('admin_role_assignments').doc(`${admin.uid}_${admin.role}`).update({ revoked_at: Timestamp.now() });
    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(row.getByRole('status')).toContainText('Authentication required');
    await expect(row.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    assert.equal((await ref.get()).get('status'), 'pending_review');
    await page.goto(origin + '/admin/posts'); await expect(page).toHaveURL(/\/admin\/login/);
  }, true);
});

test('mobile Chromium regular-user invitation completes email ownership, app password and audit without an admin cookie', { timeout: 120_000 }, async t => {
  const admin = await administrator(); const email = `invited-browser-${randomUUID()}@example.test`; let invitation;
  await browserFlow(t, admin, async page => {
    await page.goto(origin + '/admin/users'); await page.getByRole('button', { name: 'Invite user', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Reason', { exact: true }).fill(reason);
    let interrupted = false; const keys = [];
    await page.route('**/api/admin/v1/users/invite', async route => {
      keys.push(route.request().headers()['idempotency-key']);
      if (!interrupted) { interrupted = true; await route.fetch(); await route.abort('failed'); } else await route.continue();
    });
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('connection was interrupted');
    await expect(page.getByRole('button', { name: 'Send invitation', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Invitation sent and recorded in audit.');
    assert.equal(keys[0], keys[1]);
    const found = await db.collection('admin_user_invites').where('email', '==', email).get();
    assert.equal(found.size, 1); invitation = found.docs[0];
    assert.equal((await db.collection('admin_audit_log').doc(invitation.id).get()).get('action'), 'user_invited');
  }, true);
  const oobResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-lociar/oobCodes`);
  const oob = (await oobResponse.json()).oobCodes.find(item => item.email === email && item.requestType === 'EMAIL_SIGNIN');
  assert.ok(oob, 'Firebase Auth emulator must have issued an email sign-in link');
  const callback = new URL(origin + '/auth/invite');
  callback.searchParams.set('invite', invitation.id); callback.searchParams.set('mode', 'signIn');
  callback.searchParams.set('oobCode', oob.oobCode); callback.searchParams.set('apiKey', 'ci-placeholder');
  const appPassword = randomUUID() + '!';
  await browserFlow(t, null, async (page, context) => {
    await page.goto(callback.href);
    await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible();
    await page.getByLabel('Invited email').fill(email);
    await page.getByRole('button', { name: 'Verify email and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Set a password for LociAR' })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(appPassword);
    await page.getByLabel('Confirm password').fill(appPassword);
    await page.getByRole('button', { name: 'Complete invitation' }).click();
    await expect(page.getByRole('heading', { name: 'Your account is ready' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open LociAR', exact: true })).toHaveAttribute('href', 'lociar://open');
    assert.equal((await context.cookies()).some(cookie => cookie.name === '__session'), false);
    assert.equal((await db.collection('admin_role_assignments').where('user_id', '==', invitation.get('invited_user_id')).get()).empty, true);
    assert.equal((await db.collection('admin_user_invites').doc(invitation.id).get()).get('status'), 'accepted');
    assert.equal((await db.collection('admin_audit_log').doc(`invite-accept-${invitation.id}`).get()).get('action'), 'user_invite_accepted');
    const signedIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=ci-placeholder`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: appPassword, returnSecureToken: true }),
    });
    assert.equal(signedIn.status, 200); assert.equal((await signedIn.json()).localId, invitation.get('invited_user_id'));
  }, true);
});

test('Chromium user pagination keeps the handle filter through next and previous pages and resets on a new search', { timeout: 120_000 }, async t => {
  const admin = await administrator(); const prefix = 'pg' + randomUUID().replaceAll('-', '').slice(0, 10);
  const batch = db.batch();
  for (let i = 0; i < 51; i++) {
    batch.set(db.collection('profiles').doc(randomUUID()), { handle: prefix + String(i).padStart(2, '0'), created_at: Timestamp.now() });
  }
  await batch.commit();
  await browserFlow(t, admin, async page => {
    await page.goto(origin + '/admin/users?q=' + prefix);
    const rows = page.getByRole('region', { name: 'User profiles' }).locator('.dataRow.user:not(.header)');
    await expect(rows).toHaveCount(50); await expect(rows.first()).toContainText(prefix + '00');
    const pagination = page.getByRole('navigation', { name: 'Records pagination' });
    await pagination.getByRole('link', { name: 'Next records' }).click();
    await expect(page).toHaveURL(/after=/); await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(prefix + '50');
    assert.equal(new URL(page.url()).searchParams.get('q'), prefix);
    await pagination.getByRole('link', { name: 'Previous records' }).click();
    await expect(page).toHaveURL(/before=/); await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText(prefix + '00');
    await page.getByRole('textbox', { name: 'Search users by handle' }).fill(prefix + 'missing');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No matching users.', { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.has('after'), false);
    assert.equal(new URL(page.url()).searchParams.has('before'), false);
  });
});

test('Chromium creates a managed author, publishes a styled post at chosen coordinates, then creates edits and deletes its comment', {timeout:120_000}, async t=>{
 const admin=await administrator(),handle='ui_'+randomUUID().replaceAll('-','').slice(0,12),caption='Panel authored '+randomUUID();
 await browserFlow(t,admin,async page=>{
  await page.goto(origin+'/admin/users');
  const userForm=page.locator('form').filter({has:page.getByRole('button',{name:'Create user',exact:true})});
  await userForm.getByLabel('Handle',{exact:true}).fill(handle);
  await userForm.getByLabel('Display name',{exact:true}).fill('Panel browser author');
  await userForm.getByLabel('User creation reason').fill(reason);
  await userForm.getByRole('button',{name:'Create user',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Created @'+handle);
  const author=(await db.collection('profiles').where('handle','==',handle).get()).docs[0];assert.ok(author);
  const privateProfile=await db.collection('users_private').doc(author.id).get();assert.equal((await auth.getUser(privateProfile.get('uid'))).disabled,true);
  await page.goto(origin+'/admin/posts/new');
  await page.getByLabel('Find content author',{exact:true}).fill(handle);
  await expect(page.getByLabel('Select content author')).toBeVisible();await page.getByLabel('Select content author').selectOption(author.id);
  await page.getByLabel('Caption',{exact:true}).fill(caption);await page.getByLabel('AR text',{exact:true}).fill('Browser styled AR text');
  await page.getByLabel('Latitude',{exact:true}).fill('-34.92');await page.getByLabel('Longitude',{exact:true}).fill('138.6');
  await page.getByLabel('Text color',{exact:true}).fill('#00ff00');await page.getByLabel('Status').selectOption('active');
  await page.getByLabel('Audit reason',{exact:true}).fill(reason);await page.getByRole('button',{name:'Create post',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
  const id=page.url().split('/').at(-1),post=db.collection('posts').doc(id);const p=(await post.get()).data();
  assert.equal(p.creator_id,author.id);assert.equal(p.created_by_admin,admin.uid);assert.equal(p.lat,-34.92);assert.equal(JSON.parse(p.edit_data_json).layers[0].color,'#00ff00');
  await page.getByText('Create comment as selected user',{exact:true}).click();
  const createForm=page.locator('details .commentEditor');await createForm.getByLabel('Content author ID').fill(author.id);
  await createForm.getByLabel('Comment text').fill('Browser-created comment');await createForm.getByLabel('Comment reason').fill(reason);
  await createForm.getByRole('button',{name:'Create comment',exact:true}).click();
  await expect.poll(async()=> (await db.collection('comments').where('post_id','==',id).get()).size).toBe(1);
  const comment=(await db.collection('comments').where('post_id','==',id).get()).docs[0];assert.equal(comment.get('user_id'),author.id);assert.equal(comment.get('created_by_admin'),admin.uid);
  const editor=page.locator('article .commentEditor');await expect(editor).toBeVisible();
  await editor.getByLabel('Comment text').fill('Browser-edited comment');await editor.getByLabel('Comment reason').fill(reason);
  await editor.getByRole('button',{name:'Save comment',exact:true}).click();await expect.poll(async()=> (await comment.ref.get()).get('text')).toBe('Browser-edited comment');
  await editor.getByRole('button',{name:'Delete comment',exact:true}).click();await expect.poll(async()=> (await comment.ref.get()).exists).toBe(false);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',admin.uid).where('action','==','comment_delete').get()).size,1);
 });
});
