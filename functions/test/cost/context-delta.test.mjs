import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
const { recordUserContext, DEVICE_CONTEXT_HEARTBEAT_MS } = await import('../../lib/userContext.js');
after(async () => { await deleteApp(getApp()); });

test('unchanged context is acknowledged without writes; heartbeat, real changes and consent fences remain', async () => {
  const uid = randomUUID(), luid = luidForUid(uid), revision = randomUUID(), installationId = randomUUID();
  await db.collection('profiles').doc(luid).set({});
  const pref = db.collection('user_data_preferences').doc(luid);
  await pref.set({ telemetry: true, location: true, revision });
  const device = { model: 'iPhone', osVersion: '26', appVersion: '1.0', appBuild: '1', locale: 'tr', timeZone: 'Europe/Istanbul' };
  const call = (extra = {}, ip = '192.0.2.1') => recordUserContext.run({
    auth: { uid, token: { email_verified: true, firebase: { sign_in_provider: 'password' } } },
    data: { revision, installationId, device, ...extra }, rawRequest: { ip },
  });
  const ref = db.collection('user_device_context').doc(luid);
  assert.equal((await call()).storedDevice, true);
  await ref.update({ received_at: Timestamp.fromMillis(Date.now() - 120_000) });
  const original = await ref.get();
  const repeated = await call();
  assert.equal(repeated.storedDevice, false); assert.equal(repeated.deviceCurrent, true);
  assert.equal((await ref.get()).updateTime.isEqual(original.updateTime), true);
  assert.equal((await db.collection('analytics_events').where('user_id', '==', luid).get()).size, 1);
  await ref.update({ received_at: Timestamp.fromMillis(Date.now() - DEVICE_CONTEXT_HEARTBEAT_MS - 10) });
  assert.equal((await call()).storedDevice, true);
  assert.equal((await db.collection('analytics_events').where('user_id', '==', luid).get()).size, 1, 'heartbeat does not add analytics');
  const earlyChange = await call({ device: { ...device, locale: 'en' } });
  assert.equal(earlyChange.deviceCurrent, false, 'a throttled changed snapshot must retry');
  await ref.update({ received_at: Timestamp.fromMillis(Date.now() - 61_000) });
  assert.equal((await call({ device: { ...device, locale: 'en' } })).storedDevice, true);
  const beforeLocation = await ref.get();
  assert.equal((await call({ device: null, location: { lat: 41, lng: 29, accuracy: 5, measuredAt: Date.now() } })).storedLocation, true);
  assert.equal((await ref.get()).updateTime.isEqual(beforeLocation.updateTime), true);
  await pref.update({ telemetry: false, revision: randomUUID() }); await ref.delete();
  await assert.rejects(call(), error => error.code === 'permission-denied');
  assert.equal((await ref.get()).exists, false, 'old revision cannot recreate revoked context');
});
