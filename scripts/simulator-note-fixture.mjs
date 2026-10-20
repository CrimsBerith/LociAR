import { pollUntil, forEachSequential } from './async.mjs';
import { emulatorVerificationURL } from './emulator-verification.mjs';
// Test-only bridge: real demo callables + simulator location/APNs transport.
// Run with Node 22, --conditions=react-server and --import ./admin/tests/register-typescript.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-lociar');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-lociar');
assert.ok(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'Live service-account credentials are not allowed in this fixture.');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  assert.match(process.env[key] ?? '', /^127\.0\.0\.1:\d+$/);
}
const simulator = process.env.LOCIAR_TEST_SIMULATOR;
assert.match(simulator ?? '', /^[A-F0-9-]{36}$/i);
const email = process.env.E2E_EMAIL;
assert.match(email ?? '', /^simulator-[a-z0-9-]+@lociar\.test$/);
const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.LOCIAR_TEST_OUTPUT ?? resolve(root, 'build/simulator-note-e2e'));
mkdirSync(output, { recursive: true });
const requireFunctions = createRequire(resolve(root, 'functions/package.json'));
const { Timestamp } = requireFunctions('firebase-admin/firestore');
const { adminAuth, adminDb, newAnonymousUser, newUser, closeClients } = await import('../functions/test/integration/_harness.mjs');
const { queueNotification } = await import('../admin/lib/campaigns.ts');
const { luidForUid } = requireFunctions('./lib/core.js');
const { deliverAdminNotification } = requireFunctions('./lib/campaigns.js');
const bundle = 'com.khankartal.lociar';
const device = JSON.parse(execFileSync('/usr/bin/xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }));
assert.ok(Object.values(device.devices).flat().some(d => d.udid === simulator && d.name.startsWith('LociAR Notes')));
let point = { lat: 41.0082, lng: 28.9784 }, arrival, arrivalAuthor, adminJob, adminActor;
let deletingAccount, deletingPosts;
const adminDevice = randomUUID();
const sends = [];
const sim = (...args) => execFileSync('/usr/bin/xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let sample = 0, locationPaused = false;
function locate() {
  if (locationPaused) return;
  // Core Location coalesces identical simulator coordinates. A 0.11 m jitter
  // supplies fresh timestamps while remaining within the estimator's 5 m spread.
  const latitude = point.lat + (++sample % 2 ? 0.000001 : -0.000001);
  sim('location', simulator, 'set', `${latitude},${point.lng}`);
}
const locationTimer = setInterval(() => { try { locate(); } catch {} }, 900);
async function account() { const user = await adminAuth.getUserByEmail(email); return { user, luid: luidForUid(user.uid) }; }
async function preferences() { const { luid } = await account(); return (await adminDb.collection('user_data_preferences').doc(luid).get()).data(); }
function eventually(read, accepted) {
  return pollUntil(read, accepted, 100, 100, 'Expected asynchronous server state was not committed within ten seconds');
}

async function push(message) {
  const payload = { aps: { alert: message.notification, sound: 'default' }, ...message.data };
  const file = resolve(output, `simulated-push-${sends.length}.json`);
  writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
  sim('push', simulator, bundle, file);
  sends.push({ recipient: message.data?.recipient_id, activity: message.data?.activity_id });
  return { result: 'simulator-transport-accepted' };
}
const actions = {
  async 'prepare-map-group'() {
    const author = await newUser(), ids = [];
    await forEachSequential([1, 2, 3, 4, 5], async index => {
      const made = await author.call('createPlaceNote', { userId: author.luid, clientMutationId: randomUUID(),
        lat: 41.0082, lng: 28.9784, accuracy: 6, source: 'gps', text: `Glass note ${index}` });
      ids.push(made.post.id);
    });
    const first = await eventually(() => adminDb.collection('posts').doc(ids[0]).get(), doc => typeof doc.get('spot_id') === 'string');
    const spotId = first.get('spot_id'), template = first.data(), batch = adminDb.batch();
    for (let index = 1; index <= 10; index++) {
      const id = ids[index - 1] ?? randomUUID();
      if (index > 5) ids.push(id);
      batch.set(adminDb.collection('posts').doc(id), { ...template, id, client_mutation_id: id,
        caption: `Glass note ${index}`, likes_count: index, spot_id: spotId });
    }
    batch.update(adminDb.collection('note_spots').doc(spotId), { count: 10 });
    await batch.commit();
    point = { lat: 41.0074, lng: 28.9784 }; locate();
    await eventually(() => adminDb.getAll(...ids.map(id => adminDb.collection('note_density_members').doc(id))), docs => docs.every(d => d.exists));
    return { groupId: `spot:${spotId}` };
  },
  async 'enter-map-group'() { point = { lat: 41.0082, lng: 28.9784 }; locate(); return { result: 'near' }; },
  async 'leave-map-group'() { point = { lat: 41.0074, lng: 28.9784 }; locate(); return { result: 'far' }; },
  async 'verify-published'() {
    const { luid } = await account();
    const notes = await adminDb.collection('posts').where('creator_id', '==', luid).where('note_kind', '==', 'location').get();
    assert.equal(notes.size, 1);
    const note = notes.docs[0].data();
    assert.equal(note.status, 'active'); assert.equal(note.is_anonymous, true);
    assert.ok(Math.abs(note.lat - 41.0082) < 0.0001 && Math.abs(note.lng - 28.9784) < 0.0001);
    assert.equal(note.business_id, undefined);
    await eventually(() => adminDb.collection('note_density_members').doc(notes.docs[0].id).get(), s => s.get('cells')?.length === 4);
    return { caption: note.caption, count: String(notes.size), anonymous: String(note.is_anonymous), source: note.location_note.source };
  },
  async 'verify-consent'() {
    const p = await eventually(preferences, p => p?.notifications === true);
    return Object.fromEntries(['notifications', 'promotions', 'location', 'telemetry'].map(key => [key, String(p[key] === true)]).concat([['placeNotes', String(p.place_notes === true)]]));
  },
  async 'pause-location'() { locationPaused = true; sim('location', simulator, 'clear'); return { result: 'paused' }; },
  async 'resume-location'() { locationPaused = false; locate(); return { result: 'resumed' }; },
  async 'verify-no-fix'() {
    const { luid } = await account();
    const notes = await adminDb.collection('posts').where('creator_id', '==', luid).where('note_kind', '==', 'location').get();
    assert.equal(notes.size, 1); return { count: String(notes.size) };
  },
  async 'verify-fix-retry'() {
    const { luid } = await account();
    const notes = await adminDb.collection('posts').where('creator_id', '==', luid).where('note_kind', '==', 'location').get();
    assert.equal(notes.size, 2); return { count: String(notes.size) };
  },
  async 'verify-filter-retry'() {
    const { luid } = await account();
    const notes = await adminDb.collection('posts').where('creator_id', '==', luid).where('note_kind', '==', 'location').get();
    assert.equal(notes.size, 3);
    assert.equal(notes.docs.filter(note => note.get('caption') === 'Filtered text corrected').length, 1);
    return { count: String(notes.size) };
  },
  async 'prepare-arrival'() {
    arrivalAuthor ??= await newAnonymousUser();
    const body = 'Simulator nearby approved note';
    const created = await arrivalAuthor.call('createPlaceNote', {
      clientMutationId: randomUUID(), lat: 41.0112, lng: 28.9784, accuracy: 6, source: 'gps', text: body,
    });
    arrival = created.post.id;
    await adminDb.collection('posts').doc(arrival).update({ push_state: 'approved' });
    // Explicit test permission for the background-location path; consent is still set through UI.
    sim('privacy', simulator, 'grant', 'location-always', bundle);
    return { body };
  },
  async 'enter-arrival'() { point = { lat: 41.0112, lng: 28.9784 }; locate(); return { result: 'simulated-location-entered' }; },
  async 'verify-arrival'() {
    const { luid } = await account();
    const receipt = await eventually(() => adminDb.collection('place_note_notification_receipts').doc(`post_${luid}_${arrival}`).get(), s => s.get('delivery_state') === 'queued');
    assert.ok(receipt.exists);
    const activities = await adminDb.collection('activity_events').where('recipient_id', '==', luid).where('post_id', '==', arrival).get();
    return { deliveries: String(activities.size), state: receipt.get('delivery_state') };
  },
  async 'send-admin'() {
    const { luid } = await account(); const pref = await preferences();
    assert.equal(pref.notifications, true); assert.notEqual(pref.promotions, true);
    adminActor = 'simulator-admin-' + randomUUID();
    await adminDb.collection('admin_role_assignments').add({ user_id: adminActor, role_key: 'super_admin', revoked_at: null });
    await adminDb.collection('push_tokens').doc(adminDevice).set({ owner_luid: luid, token: 'fake-simulator-' + randomUUID(),
      locale: 'tr', expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
    const body = 'Simulator administrator message ' + randomUUID().slice(0, 8);
    adminJob = await queueNotification({ recipientId: luid, title: 'LociAR Simulator', message: body }, adminActor,
      'Local simulator notification acceptance', randomUUID());
    // The production trigger intentionally skips external FCM in the emulator.
    // Exercise its real delivery function with an explicit simulator sender.
    const attempts = await deliverAdminNotification(adminJob.id, async message => {
      await push(message); return 'simulator-transport-accepted';
    });
    assert.equal(attempts, 1);
    return { body };
  },
  async 'verify-admin'() {
    const job = await eventually(() => adminDb.collection('admin_notification_jobs').doc(adminJob.id).get(), s => s.get('accepted') === 1);
    const activity = await eventually(() => adminDb.collection('activity_events').doc(`admin_${adminJob.id}`).get(), s => s.get('read_at') != null);
    assert.equal(await deliverAdminNotification(adminJob.id, async message => {
      await push(message); return 'unexpected-redelivery';
    }), 0, 'A completed job must not send again.');
    assert.equal(sends.filter(s => s.activity === activity.id).length, 1);
    return { accepted: String(job.get('accepted')), read: String(activity.get('read_at') != null) };
  },
  async 'send-foreign'() {
    const body = 'Simulator foreign recipient ' + randomUUID().slice(0, 8);
    await push({ notification: { title: 'LociAR Simulator', body },
      data: { recipient_id: randomUUID(), activity_id: 'foreign_recipient_fixture' } });
    return { body };
  },
  async 'verify-off'() {
    const { luid } = await account();
    await eventually(preferences, p => p?.notifications === false);
    const jobs = () => adminDb.collection('admin_notification_jobs').where('recipient_id', '==', luid).get();
    const before = (await jobs()).size;
    await assert.rejects(queueNotification({ recipientId: luid, title: 'LociAR Simulator', message: 'Must not be sent' }, adminActor,
      'Local simulator revoked consent acceptance', randomUUID()), /opted_in/);
    return { blocked: 'true', newJobs: String((await jobs()).size - before) };
  },
  async 'deny-location'() { sim('privacy', simulator, 'revoke', 'location', bundle); return { result: 'denied' }; },
  async 'grant-location'() { sim('privacy', simulator, 'grant', 'location-always', bundle); return { result: 'granted' }; },
  async 'prepare-deletion'() {
    deletingAccount = await account();
    const posts = await adminDb.collection('posts').where('creator_id', '==', deletingAccount.luid).get();
    assert.ok(posts.size >= 3);
    deletingPosts = posts.docs.map(post => post.id);
    return { result: 'ready' };
  },
  async 'verify-deletion'() {
    assert.ok(deletingAccount);
    const { user, luid } = deletingAccount;
    await eventually(() => adminDb.collection('account_deletion_jobs').doc(luid).get(), s => s.get('status') === 'done');
    await assert.rejects(adminAuth.getUser(user.uid), error => error.code === 'auth/user-not-found');
    await Promise.all(['profiles', 'users_private', 'user_data_preferences', 'user_locations', 'user_device_context'].map(async collection => {
      assert.equal((await adminDb.collection(collection).doc(luid).get()).exists, false, collection);
    }));
    await Promise.all([['posts', 'creator_id'], ['activity_events', 'recipient_id'],
      ['push_tokens', 'owner_luid'], ['admin_notification_jobs', 'owner_luid'],
      ['place_note_notification_receipts', 'owner_luid'], ['handles', 'luid']].map(async ([collection, field]) => {
      assert.equal((await adminDb.collection(collection).where(field, '==', luid).get()).size, 0, collection);
    }));
    await eventually(() => adminDb.getAll(...deletingPosts.map(id => adminDb.collection('note_density_members').doc(id))),
      records => records.every(record => !record.exists));
    return { authDeleted: 'true', recordsDeleted: 'true' };
  },
};
// Auth-emulator email verification only: no email is sent to anyone.
const emailTimer = setInterval(async () => {
  try {
    const result = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-lociar/oobCodes');
    const codes = ((await result.json()).oobCodes ?? []).filter(code => code.email === email && code.requestType === 'VERIFY_EMAIL');
    await Promise.all(codes.map(code => fetch(emulatorVerificationURL(code.oobCode))));
  } catch {}
}, 1000);
const server = createServer(async (request, response) => {
  try {
    // Fixed messages: the method and path come from the request and are never echoed or logged.
    if (request.method !== 'POST') throw new Error('Fixture actions accept POST only');
    const action = request.url.slice(1);
    if (!Object.hasOwn(actions, action)) throw new Error('Unknown fixture action');
    const result = await actions[action]();
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
  } catch (error) {
    // Never log the raw request path (Sonar S5145): only a name taken from the fixture's own action list.
    const known = Object.keys(actions).find(name => `/${name}` === request.url) ?? 'unknown action';
    console.error('Fixture action failed:', known, error.message);
    response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(9867, '127.0.0.1', () => console.log('Simulator demo fixture ready on loopback:9867'));
async function stop() { clearInterval(locationTimer); clearInterval(emailTimer); server.close(); await closeClients(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
