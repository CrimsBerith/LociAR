import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { readPrivateUserContext } = await import('../../lib/user-context.ts');
const { permissionsFor } = await import('../../lib/rbac.ts');
const db = adminDb();
after(async () => Promise.all(getApps().map(deleteApp)));
const admin = { user: { id: 'context-admin-' + randomUUID() }, roles: ['super_admin'], permissions: permissionsFor(['super_admin']), assuranceLevel: 'aal2' };
before(async () => { await db.collection('admin_role_assignments').doc(admin.user.id).set({
  user_id: admin.user.id, role_key: 'super_admin', revoked_at: null }); });
async function seed(age = 0) {
  const luid = randomUUID(), revision = randomUUID();
  await db.collection('profiles').doc(luid).set({ handle: 'anonymous' });
  await db.collection('user_data_preferences').doc(luid).set({ location: true, telemetry: true, revision });
  await db.collection('user_locations').doc(luid).set({ owner_luid: luid, consent_revision: revision, lat: 41, lng: 29, accuracy: 20,
    measured_at: Timestamp.fromMillis(Date.now() - age), received_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  return luid;
}
test('only specific permission with MFA and reason allows private location; each read is audited without coordinates', async () => {
  const luid = await seed();
  for (const restricted of [{ ...admin, assuranceLevel: 'aal1' }, { ...admin, permissions: permissionsFor(['support_agent']) }]) {
    await assert.rejects(readPrivateUserContext(restricted, luid, 'location', 'Support investigation'), /denied/);
  }
  await assert.rejects(readPrivateUserContext(admin, luid, 'location', ''), /reason/);
  const result = await readPrivateUserContext(admin, luid, 'location', 'Support investigation');
  assert.equal(result.status, 'recent'); assert.equal(result.lat, 41);
  const audits = await db.collection('admin_audit_log').where('resource_id', '==', luid).get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].get('after_state.lat'), undefined);
});
test('stale location is labelled; revoked, expired and deleted-user location cannot be returned', async () => {
  const luid = await seed(600_000);
  assert.equal((await readPrivateUserContext(admin, luid, 'location', 'Support investigation')).status, 'stale');
  await db.collection('user_locations').doc(luid).update({ expires_at: Timestamp.fromMillis(Date.now() - 1) });
  const expired = await readPrivateUserContext(admin, luid, 'location', 'Support investigation');
  assert.equal(expired.status, 'unavailable'); assert.equal(expired.lat, undefined);
  await db.collection('user_data_preferences').doc(luid).update({ location: false });
  assert.equal((await readPrivateUserContext(admin, luid, 'location', 'Support investigation')).status, 'sharing_disabled');
  await db.collection('account_deletion_jobs').doc(luid).set({ status: 'done' });
  await assert.rejects(readPrivateUserContext(admin, luid, 'location', 'Support investigation'), /account_deleting/);
});
test('telemetry access returns bounded usage events, excludes expired events and requires its own consent', async () => {
  const luid = await seed(), preference = (await db.collection('user_data_preferences').doc(luid).get()).data();
  await db.collection('user_device_context').doc(luid).set({ owner_luid: luid, consent_revision: preference.revision,
    model: 'iPhone', os_version: '26', app_version: '1', app_build: '1', locale: 'tr', time_zone: 'Europe/Istanbul',
    installation_id: randomUUID(), observed_ip: '127.0.0.1', received_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
  for (const expired of [true, false]) await db.collection('analytics_events').add({ user_id: luid,
    event_name: expired ? 'expired' : 'post_viewed', created_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + (expired ? -1 : 86_400_000)) });
  const result = await readPrivateUserContext(admin, luid, 'telemetry', 'Support investigation');
  assert.equal(result.device.model, 'iPhone'); assert.equal(result.events.length, 1); assert.equal(result.events[0].name, 'post_viewed');
  await db.collection('user_data_preferences').doc(luid).update({ telemetry: false });
  const disabled = await readPrivateUserContext(admin, luid, 'telemetry', 'Support investigation');
  assert.equal(disabled.status, 'sharing_disabled'); assert.equal(disabled.device, undefined);
});

test('a stale MFA context cannot read private data after its live role loses permission', async () => {
  const luid = await seed(), role = db.collection('admin_role_assignments').doc(admin.user.id);
  try {
    for (const patch of [{ role_key: 'support_agent' }, { role_key: 'super_admin', revoked_at: Timestamp.now() }]) {
      await role.update(patch);
      for (const kind of ['location', 'telemetry']) {
        await assert.rejects(readPrivateUserContext(admin, luid, kind, 'Support investigation'), /permission_revoked/);
      }
    }
    assert.equal((await db.collection('admin_audit_log').where('resource_id', '==', luid).get()).size, 0);
  } finally { await role.update({ role_key: 'super_admin', revoked_at: null }); }
});

test('owner-authorized email sessions retain private-data permission and recipient consent checks', async () => {
  const luid = await seed(), emailAdmin = { ...admin, assuranceLevel: 'email_code' };
  assert.equal((await readPrivateUserContext(emailAdmin, luid, 'location', 'Support investigation')).status, 'recent');
  await assert.rejects(readPrivateUserContext({ ...emailAdmin, permissions: permissionsFor(['support_agent']) }, luid, 'location', 'Support investigation'), /denied/);
  await db.collection('user_data_preferences').doc(luid).update({ location: false });
  const result = await readPrivateUserContext(emailAdmin, luid, 'location', 'Support investigation');
  assert.equal(result.status, 'sharing_disabled'); assert.equal(result.lat, undefined);
});
