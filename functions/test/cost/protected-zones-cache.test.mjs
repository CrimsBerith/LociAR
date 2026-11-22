import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
process.env.GCLOUD_PROJECT = 'demo-lociar';
delete process.env.FUNCTIONS_EMULATOR;
const { db } = await import('../../lib/core.js');
const { protectedZoneAt, ensureZonesMeta, _test } = await import('../../lib/protectedZones.js');
after(async () => deleteApp(getApp()));

const at = (lat, lng) => db.runTransaction(tx => protectedZoneAt(lat, lng, tx));

test('createPost reuses the zone list only while the zone version is unchanged', async () => {
  const meta = db.collection('system').doc('protected_zones_meta');
  await meta.delete();
  _test.resetZoneCache();
  await ensureZonesMeta();
  await ensureZonesMeta();
  assert.equal((await meta.get()).get('version'), 1, 'created once and never overwritten');
  const zones = db.collection('protected_zones');
  await zones.doc('cache-a').set({ name: 'A', active: true, lat: -60, lng: 10, radius_meters: 50 });
  assert.equal((await at(-60, 10))?.name, 'A');
  // A direct write without a version bump is not seen: proof that the list is reused.
  await zones.doc('cache-b').set({ name: 'B', active: true, lat: -61, lng: 11, radius_meters: 50 });
  assert.equal(await at(-61, 11), null);
  // Every admin change bumps the version in its own transaction; the next admission reloads.
  await meta.set({ version: FieldValue.increment(1) }, { merge: true });
  assert.equal((await at(-61, 11))?.name, 'B');
  await zones.doc('cache-b').set({ name: 'B', active: true, lat: 'bad', lng: 11, radius_meters: 50 });
  await meta.set({ version: FieldValue.increment(1) }, { merge: true });
  await assert.rejects(at(-61, 11), /invalid geometry/, 'invalid geometry still fails closed');
  await Promise.all(['cache-a', 'cache-b'].map(id => zones.doc(id).delete()));
  await meta.set({ version: FieldValue.increment(1) }, { merge: true });
});
