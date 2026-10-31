import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newAnonymousUser, newUser, expectFailure } from './_harness.mjs';
after(closeClients);
const device = { model: 'iPhone', osVersion: '26.0', appVersion: '1.0', appBuild: '1', locale: 'tr_TR', timeZone: 'Europe/Istanbul' };
const fix = () => ({ lat: 41, lng: 29, accuracy: 15, measuredAt: Date.now() });
async function set(user, telemetry, location, revision) {
  revision ??= (await user.call('readDataPreferences')).revision;
  return user.call('setDataPreferences', { telemetry, location, revision, noticeVersion: '2026-10-11' });
}

test('sharing defaults off, requires current notice and cannot use another account', async () => {
  const user = await newAnonymousUser(), other = await newUser();
  const pref = await user.call('readDataPreferences');
  assert.equal(pref.location, false); assert.equal(pref.telemetry, false);
  const body = { revision: pref.revision, installationId: randomUUID(), device, location: fix() };
  assert.equal((await expectFailure(user.call('recordUserContext', body))).code, 'functions/permission-denied');
  assert.equal((await expectFailure(user.call('setDataPreferences', { telemetry: true, location: true, revision: '', noticeVersion: 'old' }))).code, 'functions/invalid-argument');
  assert.equal((await expectFailure(user.call('setDataPreferences', { telemetry: false, location: false, promotions: true, revision: '', noticeVersion: '2026-10-11' }))).code, 'functions/invalid-argument');
  assert.equal((await expectFailure(other.call('recordUserContext', { ...body, userId: user.luid }))).code, 'functions/permission-denied');
});

test('separate consent gates, revocation deletes snapshots and fences stale in-flight uploads', async () => {
  const user = await newAnonymousUser(), installationId = randomUUID();
  const onlyDevice = await set(user, true, false);
  assert.equal((await expectFailure(user.call('recordUserContext', { installationId, revision: onlyDevice.revision, location: fix() }))).code, 'functions/permission-denied');
  const pref = await set(user, true, true);
  await user.call('recordUserContext', { installationId, revision: pref.revision, device, location: fix() });
  for (const name of ['user_locations', 'user_device_context']) assert.equal((await adminDb.collection(name).doc(user.luid).get()).get('owner_luid'), user.luid);
  await set(user, false, false);
  for (const name of ['user_locations', 'user_device_context']) assert.equal((await adminDb.collection(name).doc(user.luid).get()).exists, false);
  assert.equal((await expectFailure(user.call('recordUserContext', { installationId, revision: pref.revision, device, location: fix() }))).code, 'functions/permission-denied');
  const newer = await set(user, false, true);
  assert.notEqual(newer.revision, pref.revision);
  assert.equal((await expectFailure(set(user, true, true, pref.revision))).code, 'functions/failed-precondition');
});

test('stale/impossible fixes are rejected, latest reports are throttled and have expiry', async () => {
  const user = await newUser(), pref = await set(user, false, true);
  const body = { installationId: randomUUID(), revision: pref.revision };
  for (const location of [{ ...fix(), lat: 91 }, { ...fix(), accuracy: -1 }, { ...fix(), measuredAt: Date.now() - 180_000 }]) {
    assert.equal((await expectFailure(user.call('recordUserContext', { ...body, location }))).code, 'functions/invalid-argument');
  }
  assert.equal((await user.call('recordUserContext', { ...body, location: fix() })).storedLocation, true);
  assert.equal((await user.call('recordUserContext', { ...body, location: fix() })).storedLocation, false);
  const data = (await adminDb.collection('user_locations').doc(user.luid).get()).data();
  assert.ok(data.expires_at.toMillis() - data.received_at.toMillis() === 86_400_000);
  await adminDb.collection('profiles').doc(user.luid).update({ suspended: true });
  assert.equal((await expectFailure(user.call('recordUserContext', { ...body, location: fix() }))).code, 'functions/permission-denied');
});

test('account hard deletion removes optional data, preferences and usage events', async () => {
  const user = await newAnonymousUser(), pref = await set(user, true, true);
  await user.call('recordUserContext', { installationId: randomUUID(), revision: pref.revision, device, location: fix() });
  await user.call('deleteAccount');
  for (const name of ['user_locations', 'user_device_context', 'user_data_preferences']) assert.equal((await adminDb.collection(name).doc(user.luid).get()).exists, false);
  assert.equal((await adminDb.collection('analytics_events').where('user_id', '==', user.luid).get()).empty, true);
});

test('arrival consent requires its notice, needs notifications on and is cleared when promotions are disabled', async () => {
  const user = await newAnonymousUser();
  assert.equal((await user.call('readDataPreferences')).arrivals, false);
  const base = { telemetry: false, location: false, promotions: true, promotionsNoticeVersion: '2026-10-11-promotions', revision: '', noticeVersion: '2026-10-11',
    notifications: true, notificationsNoticeVersion: '2026-10-11-notifications' };
  assert.equal((await expectFailure(user.call('setDataPreferences', { ...base, arrivals: true }))).code, 'functions/invalid-argument');
  const allowed = await user.call('setDataPreferences', { ...base, arrivals: true, arrivalsNoticeVersion: '2026-10-11-arrivals' });
  assert.equal(allowed.arrivals, true); assert.equal(allowed.location, false);
  const revoked = await user.call('setDataPreferences', { ...base, revision: allowed.revision, promotions: false });
  assert.equal(revoked.arrivals, false);
});

test('campaign consent drives arrivals and departures, revokes private origins and rotates the consent epoch', async () => {
  const user = await newAnonymousUser();
  const base = { telemetry: false, location: false, notifications: true, notificationsNoticeVersion: '2026-10-11-notifications', revision: '', noticeVersion: '2026-10-11' };
  assert.equal((await user.call('readDataPreferences')).departures, false);
  assert.equal((await expectFailure(user.call('setDataPreferences', { ...base, promotions: true }))).code, 'functions/invalid-argument');
  const allowed = await user.call('setDataPreferences', { ...base, promotions: true, promotionsNoticeVersion: '2026-10-11-promotions' });
  assert.equal(allowed.departures, true); assert.equal(allowed.arrivals, true);
  const pref = adminDb.collection('user_data_preferences').doc(user.luid), firstEpoch = (await pref.get()).get('departures_revision');
  const origin = adminDb.collection('campaign_departure_regions').doc(randomUUID()); await origin.set({ owner_luid: user.luid, consent_revision: firstEpoch });
  const disabled = await user.call('setDataPreferences', { ...base, revision: allowed.revision, promotions: false, promotionsNoticeVersion: '2026-10-11-promotions' });
  assert.equal(disabled.departures, false); assert.equal(disabled.arrivals, false);
  assert.equal((await origin.get()).exists, false); assert.notEqual((await pref.get()).get('departures_revision'), firstEpoch);
  const again = await user.call('setDataPreferences', { ...base, revision: disabled.revision, promotions: true, promotionsNoticeVersion: '2026-10-11-promotions' });
  assert.equal(again.departures, true); assert.notEqual((await pref.get()).get('departures_revision'), firstEpoch);
});

test('legacy combined notifications retain compatibility; explicit note choice wins and campaigns still require opt-in', async () => {
  const u = await newAnonymousUser(), base = { telemetry: false, location: false, revision: '', noticeVersion: '2026-10-11', notifications: true };
  assert.equal((await expectFailure(u.call('setDataPreferences', base))).code, 'functions/invalid-argument');
  const on = await u.call('setDataPreferences', { ...base, notificationsNoticeVersion: '2026-10-11-notifications' });
  assert.equal(on.notifications, true); assert.equal(on.placeNotes, true);
  for (const key of ['promotions', 'arrivals', 'departures']) assert.equal(on[key], false, 'marketing is not implied by notifications');
  const marketing = await u.call('setDataPreferences', { ...base, revision: on.revision, notificationsNoticeVersion: '2026-10-11-notifications',
    promotions: true, promotionsNoticeVersion: '2026-10-11-promotions' });
  for (const key of ['notifications', 'promotions', 'arrivals', 'departures', 'placeNotes']) assert.equal(marketing[key], true);
  const changed = await u.call('setDataPreferences', { telemetry: true, location: false, noticeVersion: base.noticeVersion,
    revision: marketing.revision, placeNotes: false, placeNotesNoticeVersion: '2026-10-11-place-notes' });
  for (const key of ['notifications', 'promotions', 'arrivals', 'departures']) assert.equal(changed[key], true);
  assert.equal(changed.placeNotes, false);
  const unrelated = await set(u, false, false, changed.revision);
  assert.equal(unrelated.notifications, true);
  assert.equal(unrelated.placeNotes, false, 'an unrelated telemetry change cannot revive note alerts');
  const off = await u.call('setDataPreferences', { ...base, notifications: false, revision: unrelated.revision, notificationsNoticeVersion: '2026-10-11-notifications' });
  for (const key of ['notifications', 'promotions', 'arrivals', 'departures', 'placeNotes']) assert.equal(off[key], false);
  const legacy = await u.call('setDataPreferences', { telemetry: false, location: false, noticeVersion: base.noticeVersion,
    revision: off.revision, promotions: true, promotionsNoticeVersion: '2026-10-11-promotions' });
  for (const key of ['notifications', 'promotions', 'arrivals', 'departures', 'placeNotes']) assert.equal(legacy[key], false);
});

test('explicit note-alert consent is independent of the notification delivery master', async () => {
  for (const notifications of [false, true]) {
    for (const placeNotes of [false, true]) {
      const user = await newAnonymousUser();
      const preference = await user.call('setDataPreferences', {
        telemetry: false, location: false, revision: '', noticeVersion: '2026-10-11',
        notifications, notificationsNoticeVersion: '2026-10-11-notifications',
        placeNotes, placeNotesNoticeVersion: '2026-10-11-place-notes',
      });
      assert.equal(preference.notifications, notifications);
      assert.equal(preference.placeNotes, placeNotes);
      const stored = (await adminDb.collection('user_data_preferences').doc(user.luid).get()).data();
      assert.equal(stored.notifications, notifications);
      assert.equal(stored.place_notes, placeNotes);
      assert.equal(stored.place_notes_notice_version, '2026-10-11-place-notes');
      for (const key of ['telemetry', 'location', 'promotions', 'arrivals', 'departures']) assert.equal(preference[key], false);
    }
  }
});

test('turning the notification master off and on preserves each explicit note choice', async () => {
  for (const placeNotes of [false, true]) {
    const user = await newAnonymousUser();
    let revision = '';
    for (const notifications of [true, false, true]) {
      const result = await user.call('setDataPreferences', {
        telemetry: false, location: false, revision, noticeVersion: '2026-10-11',
        notifications, notificationsNoticeVersion: '2026-10-11-notifications',
        placeNotes, placeNotesNoticeVersion: '2026-10-11-place-notes',
      });
      assert.equal(result.notifications, notifications);
      assert.equal(result.placeNotes, placeNotes, 'master delivery changes do not rewrite note consent');
      revision = result.revision;
    }
  }
});

test('note-alert overrides require the current note notice and reject stale revisions without mutation', async () => {
  const user = await newAnonymousUser();
  const base = { telemetry: false, location: false, revision: '', noticeVersion: '2026-10-11',
    notifications: true, notificationsNoticeVersion: '2026-10-11-notifications' };
  for (const placeNotes of [false, true]) {
    for (const notice of [undefined, 'old']) {
      const invalid = { ...base, placeNotes, ...(notice === undefined ? {} : { placeNotesNoticeVersion: notice }) };
      assert.equal((await expectFailure(user.call('setDataPreferences', invalid))).code, 'functions/invalid-argument');
      assert.equal((await user.call('readDataPreferences')).revision, '', 'invalid consent must not write preferences');
    }
  }
  const accepted = await user.call('setDataPreferences', { ...base, placeNotes: false, placeNotesNoticeVersion: '2026-10-11-place-notes' });
  assert.equal((await expectFailure(user.call('setDataPreferences', {
    ...base, placeNotes: true, placeNotesNoticeVersion: '2026-10-11-place-notes',
  }))).code, 'functions/failed-precondition');
  const current = await user.call('readDataPreferences');
  assert.equal(current.revision, accepted.revision);
  assert.equal(current.notifications, true);
  assert.equal(current.placeNotes, false);
});
