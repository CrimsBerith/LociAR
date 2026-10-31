// Test-only UI bridge: an emulator admin queues the message through the actual panel.
// No production authentication, role changes, secrets or external messaging transport.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {resolve, join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import ciEnvironment from '../admin/scripts/ci-environment.json' with {type: 'json'};

const root = resolve(import.meta.dirname, '..');
const requireAdmin = createRequire(join(root, 'admin/package.json'));
const {chromium, expect} = requireAdmin('@playwright/test');

export async function queueThroughSimulatorAdminPanel({adminAuth, adminDb, adminUID, recipient, title, message, output}) {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-lociar');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-lociar');
  for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']) {
    assert.match(process.env[key] ?? '', /^127\.0\.0\.1:\d+$/);
  }
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  assert.match(recipient, /^[a-f0-9-]{36}$/);
  const email = `${adminUID}@example.test`;
  await adminAuth.createUser({uid: adminUID, email, emailVerified: true});
  const allocator = createServer();
  allocator.listen(0, '127.0.0.1'); await once(allocator, 'listening');
  const port = allocator.address().port;
  await new Promise(accept => allocator.close(accept));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: join(root, 'admin'), env: {...process.env, ...ciEnvironment, NODE_ENV: 'production', ADMIN_ORIGIN: origin},
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let browser;
  try {
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline && server.exitCode === null) {
      try { if ((await fetch(origin + '/admin/login')).ok) { ready = true; break; } } catch {}
      await new Promise(accept => setTimeout(accept, 200));
    }
    assert.ok(ready, 'The isolated local admin server did not start');
    const now = Math.floor(Date.now() / 1000);
    // Auth emulator unsigned JWTs model the existing AAL2 fixture; they do not
    // establish real MFA or signature-verification acceptance.
    const claims = {iss: 'https://securetoken.google.com/demo-lociar', aud: 'demo-lociar', sub: adminUID,
      user_id: adminUID, iat: now, exp: now + 3600, auth_time: now, email, email_verified: true,
      firebase: {identities: {}, sign_in_provider: 'password', sign_in_second_factor: 'totp'}};
    const idToken = [Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url'),
      Buffer.from(JSON.stringify(claims)).toString('base64url'), ''].join('.');
    const session = await fetch(origin + '/api/auth/session', {method: 'POST',
      headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({idToken})});
    assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie').split(';')[0].slice('__session='.length);
    browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox']});
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, locale: 'en-US'});
    await context.addCookies([{name: '__session', value: cookie, url: origin, httpOnly: true, secure: true, sameSite: 'Strict'}]);
    await context.route(/^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({url: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/${url.hostname}${url.pathname}${url.search}`});
      await route.fulfill({response, headers: {...response.headers(), 'access-control-allow-origin': origin}});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('dialog', dialog => dialog.accept('Local simulator notification acceptance'));
    const profile = await adminDb.collection('profiles').doc(recipient).get();
    assert.ok(profile.exists && profile.get('handle'));
    await page.goto(origin + '/admin/users?q=' + encodeURIComponent(profile.get('handle')));
    const row = page.locator('.dataRow.user').filter({hasText: recipient});
    await row.getByText('Private data', {exact: true}).click();
    await row.getByText('Send this user a notification', {exact: true}).click();
    const form = row.locator('form.decisionForm');
    await form.getByLabel('Title', {exact: true}).fill(title);
    await form.getByLabel('Message', {exact: true}).fill(message);
    await form.getByLabel('Reason', {exact: true}).fill('Local simulator notification acceptance');
    const folder = join(output, 'admin-panel'); mkdirSync(folder, {recursive: true});
    await page.screenshot({path: join(folder, 'before-queue.png'), fullPage: true});
    await form.getByRole('button', {name: 'Queue notification', exact: true}).click();
    await expect(form.getByRole('status')).toContainText('Queued.');
    await page.screenshot({path: join(folder, 'queued.png'), fullPage: true});
    const jobs = await adminDb.collection('admin_notification_jobs').where('recipient_id', '==', recipient).get();
    const job = jobs.docs.find(doc => doc.get('message') === message && doc.get('title') === title);
    assert.ok(job, 'The panel did not persist this exact recipient/message');
    return job.ref;
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
      await once(server, 'exit'); clearTimeout(timer);
    }
  }
}
