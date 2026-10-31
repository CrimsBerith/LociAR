import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, Timestamp, analyticsEventDoc, db, isUUID, requireCaller } from './core';
import { requireActiveAccount } from './profileGuard';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };
export const USER_CONTEXT_NOTICE = '2026-10-11';
export const DEVICE_CONTEXT_HEARTBEAT_MS = 15 * 60_000;
const preferences = (luid: string) => db.collection('user_data_preferences').doc(luid);
function summary(data: FirebaseFirestore.DocumentData | undefined) {
  return { ok: true, telemetry: data?.telemetry === true, location: data?.location === true,
    promotions: data?.promotions === true,
    arrivals: data?.arrivals === true && data?.promotions === true,
    departures: data?.departures === true && data?.promotions === true,
    placeNotes: data?.place_notes === true,
    notifications: data?.notifications === true,
    revision: typeof data?.revision === 'string' ? data.revision : '', noticeVersion: USER_CONTEXT_NOTICE };
}

export const readDataPreferences = onCall(options, async request => {
  const caller = requireCaller(request);
  return await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    return summary((await tx.get(preferences(caller.luid))).data());
  });
});

/** A dedicated opt-in, independent of AR location permission. Revocation invalidates queued uploads. */
export const setDataPreferences = onCall(options, async request => {
  const caller = requireCaller(request), body = request.data;
  if (typeof body?.telemetry !== 'boolean' || typeof body?.location !== 'boolean'
      || body.noticeVersion !== USER_CONTEXT_NOTICE || typeof body.revision !== 'string') {
    throw new HttpsError('invalid-argument', 'Accept the current data-sharing notice');
  }
  if (body.promotions !== undefined && (typeof body.promotions !== 'boolean'
      || body.promotionsNoticeVersion !== '2026-10-11-promotions')) throw new HttpsError('invalid-argument', 'Accept the campaign notice');
  if (body.arrivals !== undefined && (typeof body.arrivals !== 'boolean'
      || body.arrivalsNoticeVersion !== '2026-10-11-arrivals')) throw new HttpsError('invalid-argument', 'Accept the arrival notification notice');
  if (body.departures !== undefined && (typeof body.departures !== 'boolean'
      || body.departuresNoticeVersion !== '2026-10-11-departures')) throw new HttpsError('invalid-argument', 'Accept the departure notification notice');
  if (body.placeNotes !== undefined && (typeof body.placeNotes !== 'boolean'
      || body.placeNotesNoticeVersion !== '2026-10-11-place-notes')) throw new HttpsError('invalid-argument', 'Accept the location-note notification notice');
  if (body.notifications !== undefined && (typeof body.notifications !== 'boolean'
      || body.notificationsNoticeVersion !== '2026-10-11-notifications')) throw new HttpsError('invalid-argument', 'Accept the unified notification notice');
  return await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const current = await tx.get(preferences(caller.luid));
    if (body.revision !== summary(current.data()).revision) throw new HttpsError('failed-precondition', 'Data preferences changed; refresh and retry');
    const notifications = body.notifications ?? current.get('notifications') ?? null;
    // Current clients disclose note alerts separately. Keep that explicit choice even when
    // the delivery master is off, so re-enabling social notifications cannot imply a new opt-in.
    // Old clients omit placeNotes and use the combined notification notice; preserve their
    // explicit on/off behavior, but unrelated preference updates must not revive note alerts.
    const placeNotes = body.placeNotes !== undefined ? body.placeNotes
      : body.notifications !== undefined ? body.notifications : current.get('place_notes') === true;
    const data = { owner_luid: caller.luid, telemetry: body.telemetry, location: body.location,
      notifications,
      notifications_notice_version: body.notifications !== undefined ? '2026-10-11-notifications' : current.get('notifications_notice_version') ?? null,
      // Marketing needs its own explicit opt-in (App Review 4.5.4) on top of Notifications; campaign
      // arrivals and departures follow it. Turning Notifications off turns marketing off too.
      ...(() => {
        const marketing = notifications === true && (body.promotions ?? current.get('promotions') === true);
        return { promotions: marketing, arrivals: marketing, departures: marketing };
      })(),
      place_notes: placeNotes,
      place_notes_notice_version: body.placeNotes !== undefined ? '2026-10-11-place-notes' : current.get('place_notes_notice_version') ?? null,
      departures_revision: current.get('departures') === true && typeof current.get('departures_revision') === 'string' ? current.get('departures_revision') : randomUUID(),
      departures_notice_version: body.departures !== undefined ? '2026-10-11-departures' : current.get('departures_notice_version') ?? null,
      arrivals_notice_version: body.arrivals !== undefined ? '2026-10-11-arrivals' : current.get('arrivals_notice_version') ?? null,
      promotions_notice_version: body.promotions !== undefined ? '2026-10-11-promotions' : current.get('promotions_notice_version') ?? null,
      revision: randomUUID(), notice_version: USER_CONTEXT_NOTICE, updated_at: FieldValue.serverTimestamp() };
    if (!data.departures) data.departures_revision = randomUUID();
    const departureRegions = data.departures ? null : await tx.get(db.collection('campaign_departure_regions').where('owner_luid', '==', caller.luid).limit(100));
    tx.set(preferences(caller.luid), data);
    for (const region of departureRegions?.docs ?? []) tx.delete(region.ref);
    if (!data.telemetry) tx.delete(db.collection('user_device_context').doc(caller.luid));
    if (!data.location) tx.delete(db.collection('user_locations').doc(caller.luid));
    return summary(data);
  });
});

function bounded(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > limit || /[\u0000-\u001f]/.test(value)) {
    throw new HttpsError('invalid-argument', 'Invalid device context');
  }
  return value;
}

export const recordUserContext = onCall(options, async request => {
  const caller = requireCaller(request), body = request.data;
  if (!isUUID(body?.installationId) || typeof body?.revision !== 'string') throw new HttpsError('invalid-argument', 'Invalid context identity');
  const now = Date.now(), location = body.location;
  if (location != null && (!Number.isFinite(location.lat) || Math.abs(location.lat) > 90
      || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180
      || !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 10_000
      || !Number.isFinite(location.measuredAt) || location.measuredAt < now - 120_000 || location.measuredAt > now + 10_000)) {
    throw new HttpsError('invalid-argument', 'A recent location fix is required');
  }
  const device = body.device == null ? null : {
    model: bounded(body.device.model, 80), os_version: bounded(body.device.osVersion, 40),
    app_version: bounded(body.device.appVersion, 40), app_build: bounded(body.device.appBuild, 40),
    locale: bounded(body.device.locale, 80), time_zone: bounded(body.device.timeZone, 80),
  };
  return await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const pref = summary((await tx.get(preferences(caller.luid))).data());
    if (!pref.revision || pref.revision !== body.revision || (device && !pref.telemetry) || (location && !pref.location)) {
      throw new HttpsError('permission-denied', 'Data sharing is not enabled');
    }
    const deviceRef = db.collection('user_device_context').doc(caller.luid);
    const locationRef = db.collection('user_locations').doc(caller.luid);
    const [oldDevice, oldLocation] = await Promise.all([
      device ? tx.get(deviceRef) : undefined, location ? tx.get(locationRef) : undefined,
    ]);
    const common = { owner_luid: caller.luid, installation_id: body.installationId.toLowerCase(),
      consent_revision: pref.revision, received_at: Timestamp.fromMillis(now) };
    let storedDevice = false, storedLocation = false;
    const ip = request.rawRequest.ip;
    const observedIP = typeof ip === 'string' && isIP(ip) ? ip : null;
    const sameDevice = Boolean(device && oldDevice?.exists && oldDevice.get('installation_id') === common.installation_id
      && oldDevice.get('consent_revision') === pref.revision && oldDevice.get('observed_ip') === observedIP
      && Object.entries(device).every(([key, value]) => oldDevice.get(key) === value));
    const deviceAge = now - (oldDevice?.get('received_at')?.toMillis?.() ?? 0);
    if (device && deviceAge >= 60_000 && (!sameDevice || deviceAge >= DEVICE_CONTEXT_HEARTBEAT_MS)) {
      tx.set(deviceRef, { ...common, ...device, observed_ip: observedIP,
        expires_at: Timestamp.fromMillis(now + 30 * 86_400_000) });
      // A heartbeat is not a new foreground event. Keep an event for a new consent/session
      // device or app version instead of writing another analytics row every minute.
      if (!oldDevice?.exists || oldDevice.get('installation_id') !== common.installation_id
        || oldDevice.get('consent_revision') !== pref.revision || oldDevice.get('app_version') !== device.app_version
        || oldDevice.get('app_build') !== device.app_build) {
        tx.create(db.collection('analytics_events').doc(randomUUID()), analyticsEventDoc({
          userId: caller.luid, name: 'app_foreground_context', properties: { installation_id: common.installation_id, app_version: device.app_version },
        }));
      }
      storedDevice = true;
    }
    if (location && now - (oldLocation?.get('received_at')?.toMillis?.() ?? 0) >= 30_000
        && location.measuredAt > (oldLocation?.get('measured_at')?.toMillis?.() ?? 0)) {
      tx.set(locationRef, { ...common, lat: location.lat, lng: location.lng, accuracy: location.accuracy,
        measured_at: Timestamp.fromMillis(location.measuredAt), expires_at: Timestamp.fromMillis(now + 86_400_000) });
      storedLocation = true;
    }
    return { ok: true, storedDevice, storedLocation, deviceCurrent: Boolean(device && (sameDevice || storedDevice)) };
  });
});
