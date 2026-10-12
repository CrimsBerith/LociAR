import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, isUUID, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, luidForUid } from './core';
import { requireActiveAccount, accountDeletionRef } from './profileGuard';
import { campaignOffer, campaignPushBody } from './campaigns';
import { distanceMeters } from './geo';
import { campaignEntryRadius, fixInsideNote } from './placeNoteRules';
import { pushQuotaId, pushQuotaDecision } from './pushPolicy';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };

/** Region monitoring receives only the signed-in user's previously assigned offers. */
export const readCampaignRegions = onCall(options, async request => {
  const caller = requireCaller(request), now = Date.now();
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [pref, flags] = await tx.getAll(db.collection('user_data_preferences').doc(caller.luid), db.collection('system').doc('flags'));
    if (pref.get('promotions') !== true || (pref.get('arrivals') !== true && pref.get('departures') !== true) || flags.get('kill_switch') === true) return { regions: [] };
    const assignments = await tx.get(db.collection('campaign_targets').where('owner_luid', '==', caller.luid).where('expires_at', '>', Timestamp.fromMillis(now)).limit(50));
    const regions = [];
    for (const a of assignments.docs) {
      const departure = a.get('notification_mode') === 'departure';
      if ((!departure && a.get('notification_mode') !== 'arrival') || a.get('arrival_notified_at')
          || pref.get(departure ? 'departures' : 'arrivals') !== true) continue;
      const offer = await campaignOffer(tx, caller.luid, a.get('campaign_id'), now);
      if (!offer) continue;
      const c = await tx.get(db.collection('campaigns').doc(a.get('campaign_id')));
      const origin = departure ? await tx.get(db.collection('campaign_departure_regions').doc(a.id)) : null;
      if (departure && (!origin?.exists || typeof pref.get('departures_revision') !== 'string' || origin.get('consent_revision') !== pref.get('departures_revision')
          || !(origin.get('expires_at') instanceof Timestamp) || origin.get('expires_at').toMillis() <= now)) continue;
      const lat = departure ? origin!.get('lat') : c.get('lat'), lng = departure ? origin!.get('lng') : c.get('lng');
      const radius = departure ? origin!.get('radius') : c.get('arrivalRadius') ?? 150;
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isFinite(radius) || radius < 100 || radius > 500) continue;
      regions.push({ id: c.id, lat, lng, radius, ...(!departure ? { triggerRadius: campaignEntryRadius(c.get('entryRadius')) } : {}), transition: departure ? 'exit' : 'entry',
        expiresAt: departure ? Math.min(origin!.get('expires_at').toMillis(), c.get('ends_at').toMillis()) : c.get('ends_at').toMillis() });
    }
    return { regions };
  });
});

/** Coordinates are used transiently for admission; background fixes never update the admin location snapshot. */
export const recordCampaignArrival = onCall(options, async request => {
  const caller = requireCaller(request), b = request.data, now = Date.now(), fix = b?.location;
  const transition = b?.transition ?? 'entry', departure = transition === 'exit';
  if (!isUUID(b?.campaignId) || typeof b?.locale !== 'string' || b.locale.length > 80 || !fix
      || !['entry', 'exit'].includes(transition)
      || !Number.isFinite(fix.lat) || Math.abs(fix.lat) > 90 || !Number.isFinite(fix.lng) || Math.abs(fix.lng) > 180
      || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 200
      || !Number.isFinite(fix.measuredAt) || now - fix.measuredAt > 60_000 || fix.measuredAt > now + 10_000) {
    throw new HttpsError('invalid-argument', 'A recent, accurate arrival fix is required');
  }
  const id = b.campaignId.toLowerCase(), activityId = `arrival_${id}_${caller.luid}`;
  return db.runTransaction(async tx => {
    const [flags, pref, target, c, activity, quota] = await tx.getAll(db.collection('system').doc('flags'),
      db.collection('user_data_preferences').doc(caller.luid), db.collection('campaign_targets').doc(`${id}_${caller.luid}`),
      db.collection('campaigns').doc(id), db.collection('activity_events').doc(activityId), db.collection('promotion_push_quota').doc(pushQuotaId(caller.luid, now)));
    if (flags.get('kill_switch') === true || pref.get('promotions') !== true || pref.get(departure ? 'departures' : 'arrivals') !== true
        || target.get('notification_mode') !== (departure ? 'departure' : 'arrival') || target.get('arrival_notified_at') || activity.exists
        || !(target.get('expires_at') instanceof Timestamp) || target.get('expires_at').toMillis() <= now) return { notify: false };
    const offer = await campaignOffer(tx, caller.luid, id, now);
    if (!offer) return { notify: false };
    if (!departure && (now - fix.measuredAt > 10_000 || fix.measuredAt > now + 5000)) return { notify: false };
    if (!departure && pref.get('notifications') === true && (!Number.isFinite(b.confirmationStartedAt) || b.confirmationStartedAt > fix.measuredAt - 2000 || b.confirmationStartedAt < now - 30_000)) return { notify: false };
    const origin = departure ? await tx.get(db.collection('campaign_departure_regions').doc(target.id)) : null;
    if (departure && (!origin?.exists || typeof pref.get('departures_revision') !== 'string' || origin.get('consent_revision') !== pref.get('departures_revision')
        || !(origin.get('expires_at') instanceof Timestamp) || origin.get('expires_at').toMillis() <= now)) return { notify: false };
    // Arrival: the same GPS-tolerant rule as location notes, so passing the shop on foot or by car counts.
    const radius = departure ? origin!.get('radius') : campaignEntryRadius(c.get('entryRadius'));
    const distance = distanceMeters(fix.lat, fix.lng, departure ? origin!.get('lat') : c.get('lat'), departure ? origin!.get('lng') : c.get('lng'));
    if (!Number.isFinite(radius) || (departure && (radius < 100 || radius > 500)) || !Number.isFinite(distance)
        || (departure ? distance - fix.accuracy <= radius : !fixInsideNote({ ...fix, measuredAt: fix.measuredAt }, c.get('lat'), c.get('lng'), radius))) return { notify: false };
    const actor = target.get('assigned_by');
    if (typeof actor !== 'string') return { notify: false };
    const [roles, deletion] = await Promise.all([
      tx.get(db.collection('admin_role_assignments').where('user_id', '==', actor).where('revoked_at', '==', null)),
      tx.get(accountDeletionRef(luidForUid(actor))),
    ]);
    if (deletion.exists || !roles.docs.some(d => d.get('role_key') === 'super_admin')) return { notify: false };
    const decision = pushQuotaDecision(quota.data(), activityId, 3);
    if (!decision.allow) return { notify: false };
    tx.set(quota.ref, { ...decision.next, owner_luid: caller.luid, expires_at: Timestamp.fromMillis(now + 2 * 86_400_000) });
    tx.update(target.ref, { arrival_notified_at: Timestamp.fromMillis(now), movement_event: transition });
    if (origin) tx.delete(origin.ref);
    tx.create(activity.ref, { kind: 'promotion', anonymous: true, actor_id: null, recipient_id: caller.luid, post_id: id,
      body: target.get('notification_message') || 'Sana özel bir kampanya var.', read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * 86_400_000) });
    return { notify: true, title: target.get('notification_title') || 'LociAR', body: target.get('notification_message') || campaignPushBody(b.locale), postId: id, activityId, recipientId: caller.luid };
  });
});
