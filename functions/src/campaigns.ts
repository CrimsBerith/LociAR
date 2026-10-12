import { createHash } from 'node:crypto';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { db, FieldValue, Timestamp, isUUID, luidForUid, HttpsError, requireCaller, identityVerified, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, safeErrorCode } from './core';
import { requireActiveAccount, accountDeletionRef, profileBlock } from './profileGuard';
import { isBlocked } from './anonymousAccess';
import { distanceMeters } from './geo';
import { anyBlocked } from './moderation';
import { MAX_PUSH_DEVICES, validPushToken, pushDeliveryId, invalidPushTokenCode, pushQuotaDecision, pushQuotaId, pushLocale } from './pushPolicy';

export function campaignLive(c: FirebaseFirestore.DocumentData | undefined, now = Date.now()): boolean {
  return Boolean(c && c.status === 'active' && c.starts_at instanceof Timestamp && c.ends_at instanceof Timestamp
    && c.starts_at.toMillis() <= now && c.ends_at.toMillis() > now);
}

/** Targeted offers never enter the public posts collection or leak an audience identity. */
export async function campaignOffer(tx: FirebaseFirestore.Transaction, luid: string, id: string, now = Date.now()) {
  if (!isUUID(id)) return null;
  const [c, target, pref] = await tx.getAll(db.collection('campaigns').doc(id), db.collection('campaign_targets').doc(`${id}_${luid}`), db.collection('user_data_preferences').doc(luid));
  if (!campaignLive(c.data(), now) || target.get('state') !== 'assigned' || pref.get('promotions') !== true || !c.get('post_projection')
      || !(target.get('expires_at') instanceof Timestamp) || target.get('expires_at').toMillis() <= now) return null;
  const brand = await tx.get(db.collection('brands').doc(c.get('brand_id')));
  if (brand.get('status') !== 'active') return null;
  await requireActiveAccount(tx, luid);
  const [author, deletion] = await tx.getAll(db.collection('profiles').doc(brand.get('author_luid')), accountDeletionRef(brand.get('author_luid')));
  if (profileBlock(author.data()) || deletion.exists) return null;
  if (await isBlocked(luid, brand.get('author_luid'), tx)) return null;
  return { id: c.id, ...c.get('post_projection'), sponsorship: c.get('post_projection.sponsorship'), views_count: c.get('views_count') ?? 0,
    likes_count: 0, comments_count: 0, campaign_id: c.id };
}

export async function ownCampaignOffers(luid: string, lat: number, lng: number, radius: number) {
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, luid);
    const assignments = await tx.get(db.collection('campaign_targets').where('owner_luid', '==', luid).where('expires_at', '>', Timestamp.now()).limit(50));
    const offers = [];
    for (const assignment of assignments.docs) {
      const offer = await campaignOffer(tx, luid, assignment.get('campaign_id'));
      if (offer) {
        const pose = JSON.parse(offer.pose_json);
        if (distanceMeters(lat, lng, pose.latitude, pose.longitude) <= radius) offers.push(offer);
      }
    }
    return offers;
  });
}

const offerBodies: Record<string, string> = {
  en: 'A new offer is available for you.', tr: 'Sana özel bir kampanya var.', 'zh-Hans': '你有一个专属优惠。', hi: 'आपके लिए एक नया ऑफ़र है।',
  es: 'Hay una nueva oferta para ti.', fr: 'Une nouvelle offre vous attend.', ar: 'هناك عرض جديد لك.', bn: 'আপনার জন্য একটি নতুন অফার আছে।',
  pt: 'Há uma nova oferta para você.', ru: 'Для вас есть новое предложение.', de: 'Ein neues Angebot wartet auf dich.', ja: 'あなた向けの新しいオファーがあります。',
};
export const campaignPushBody = (locale: unknown) => offerBodies[pushLocale(locale)];

/** At most one FCM attempt per job/device. Accepted means accepted by FCM, not delivered. */
export async function deliverAdminNotification(id: string, send: (message: Message) => Promise<string>, now = Date.now()) {
  const ref = db.collection('admin_notification_jobs').doc(id), initial = (await ref.get()).data();
  if (!initial || !isUUID(initial.recipient_id) || !['queued', 'processing'].includes(initial.status)) return 0;
  const recipient = initial.recipient_id;
  const devices = await db.collection('push_tokens').where('owner_luid', '==', recipient).limit(MAX_PUSH_DEVICES).get();
  let attempts = 0;
  for (const device of devices.docs) {
    const receiptRef = db.collection('admin_notification_receipts').doc(pushDeliveryId(id, device.id));
    const quotaRef = db.collection('promotion_push_quota').doc(pushQuotaId(recipient, now));
    const message = await db.runTransaction(async tx => {
      if ((await tx.get(db.collection('system').doc('flags'))).get('kill_switch') === true) return null;
      const [job, target, receipt, profile, deletion, pref, quota, actorDeletion] = await tx.getAll(ref, device.ref, receiptRef,
        db.collection('profiles').doc(recipient), accountDeletionRef(recipient), db.collection('user_data_preferences').doc(recipient), quotaRef,
        accountDeletionRef(luidForUid(initial.actor_uid)));
      const data = job.data();
      if (!data || data.recipient_id !== recipient || data.status === 'complete' || data.expires_at.toMillis() <= now
          || receipt.exists || !profile.exists || profile.get('suspended') || profile.get('deleted_at') || deletion.exists || actorDeletion.exists
          || pref.get('promotions') !== true || pref.get('revision') !== data.consent_revision
          || target.get('owner_luid') !== recipient || !validPushToken(target.get('token')) || target.get('expires_at').toMillis() <= now) return null;
      const roles = await tx.get(db.collection('admin_role_assignments').where('user_id', '==', data.actor_uid).where('revoked_at', '==', null));
      // Only super admins send in this first phase; a future brand editor cannot address users.
      if (!roles.docs.some(d => d.get('role_key') === 'super_admin')) return null;
      let activityBody = data.message, body = data.message, postId = '';
      if (data.campaign_id) {
        const assignment = await tx.get(db.collection('campaign_targets').doc(`${data.campaign_id}_${recipient}`));
        if ((assignment.get('notification_mode') ?? 'immediate') !== 'immediate') return null;
        const c = (await tx.get(db.collection('campaigns').doc(data.campaign_id))).data();
        const offer = await campaignOffer(tx, recipient, data.campaign_id, now);
        const location = await tx.get(db.collection('user_locations').doc(recipient));
        if (!c || !offer || pref.get('location') !== true || location.get('consent_revision') !== pref.get('revision')
            || !(location.get('measured_at') instanceof Timestamp) || now - location.get('measured_at').toMillis() > 120_000
            || location.get('expires_at').toMillis() <= now || location.get('accuracy') > 200
            || distanceMeters(c.lat, c.lng, location.get('lat'), location.get('lng')) + location.get('accuracy') > c.radius) return null;
        const posts = await tx.get(db.collection('posts').where('creator_id', '==', recipient).orderBy('created_at', 'desc').limit(100));
        const approved = posts.docs.filter(p => p.get('status') === 'active' && p.get('visibility') === 'public' && !p.get('deleted_at') && p.get('age_rating') !== '18_plus');
        const bestLikes = Math.max(0, ...approved.map(p => {
          const offset = p.get('metrics_counter_offsets')?.likes_count;
          if (p.get('metrics_admin_edited_at') && !Number.isSafeInteger(offset)) return 0;
          return Math.max(0, Number(p.get('likes_count') ?? 0) - (Number.isSafeInteger(offset) ? offset : 0));
        }));
        if (approved.length < c.minPosts || bestLikes < c.minLikes) return null;
        body = data.message || campaignPushBody(target.get('locale')); activityBody = data.message || 'Sana özel bir kampanya var.'; postId = data.campaign_id;
      }
      const decision = pushQuotaDecision(quota.data(), id, 3);
      if (!decision.allow) return null;
      const activityRef = db.collection('activity_events').doc(`admin_${id}`), activity = await tx.get(activityRef);
      if (decision.next) tx.set(quotaRef, { owner_luid: recipient, ...decision.next, expires_at: Timestamp.fromMillis(now + 2 * 86_400_000) });
      if (!activity.exists) tx.create(activityRef, { kind: postId ? 'promotion' : 'admin_notice', anonymous: true, actor_id: null,
        recipient_id: recipient, post_id: postId || null, body: activityBody, read_at: null, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * 86_400_000) });
      tx.create(receiptRef, { owner_luid: recipient, job_id: id, status: 'attempted', created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 30 * 86_400_000) });
      return { token: target.get('token'), notification: { title: data.title, body },
        data: { recipient_id: recipient, post_id: postId, activity_id: activityRef.id },
        apns: { headers: { 'apns-collapse-id': id, 'apns-expiration': String(Math.floor(now / 1000) + 3600) }, payload: { aps: { sound: 'default' } } } } satisfies Message;
    });
    if (!message) continue;
    attempts++;
    try { await send(message); await receiptRef.update({ status: 'accepted' }); }
    catch (error) {
      const code = safeErrorCode(error);
      if (invalidPushTokenCode(code)) await db.runTransaction(async tx => {
        const latest = await tx.get(device.ref);
        if (latest.get('owner_luid') === recipient && latest.get('token') === message.token) tx.delete(device.ref);
      });
      await receiptRef.update({ status: 'failed', error_code: code }).catch(() => {});
    }
  }
  await db.runTransaction(async tx => {
    const job = await tx.get(ref);
    if (!job.exists || (await tx.get(accountDeletionRef(recipient))).exists) return;
    const receipts = await tx.get(db.collection('admin_notification_receipts').where('job_id', '==', id));
    const count = (status: string) => receipts.docs.filter(d => d.get('status') === status).length;
    tx.update(ref, { status: count('attempted') ? 'processing' : 'complete', accepted: count('accepted'), failed: count('failed'),
      attempts: receipts.size, no_device: devices.empty, updated_at: FieldValue.serverTimestamp() });
  });
  return attempts;
}
export const onAdminNotificationQueued = onDocumentCreated('admin_notification_jobs/{jobId}', async event => {
  // Emulator tests inject a sender; never contact live FCM with Mac credentials.
  if (process.env.FUNCTIONS_EMULATOR === 'true') return;
  if (event.data) await deliverAdminNotification(event.params.jobId, message => getMessaging().send(message));
});

/** Future brand clients can submit a draft; only the admin panel can approve/target/send. */
export const submitBrandCampaign = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async request => {
  const caller = requireCaller(request), b = request.data;
  if (!identityVerified(caller) || !isUUID(b?.brandId) || !isUUID(b?.mutationId)) throw new HttpsError('permission-denied', 'Verified brand editor required');
  const texts = ['name', 'message', 'terms'] as const;
  for (const key of texts) if (typeof b[key] !== 'string' || b[key].trim().length < 1 || b[key].length > (key === 'name' ? 80 : key === 'message' ? 1000 : 800)
    || anyBlocked([b[key]]) || /[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,63}(?:\b|$)/iu.test(b[key])) throw new HttpsError('invalid-argument', 'Only moderated text without links is allowed');
  if (!Number.isFinite(b.lat) || Math.abs(b.lat) > 90 || !Number.isFinite(b.lng) || Math.abs(b.lng) > 180
    || !Number.isFinite(b.radius) || b.radius < 100 || b.radius > 5000 || !Number.isFinite(b.startsAt) || !Number.isFinite(b.endsAt)
    || b.endsAt <= Math.max(Date.now(), b.startsAt + 60_000) || b.endsAt > b.startsAt + 90 * 86_400_000) throw new HttpsError('invalid-argument', 'Invalid campaign location or dates');
  const id = b.mutationId.toLowerCase();
  const hash = createHash('sha256').update(JSON.stringify([caller.luid, b.brandId.toLowerCase(), b.name.trim(), b.message.trim(), b.terms.trim(), b.lat, b.lng, b.radius, b.startsAt, b.endsAt])).digest('hex');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const [brand, membership, previous, quota] = await tx.getAll(db.collection('brands').doc(b.brandId.toLowerCase()), db.collection('brand_memberships').doc(`${b.brandId.toLowerCase()}_${caller.luid}`),
      db.collection('campaigns').doc(id), db.collection('brand_submission_quota').doc(`${caller.luid}_${Math.floor(Date.now() / 3_600_000)}`));
    if (brand.get('status') !== 'active' || membership.get('active') !== true || membership.get('role') !== 'editor') throw new HttpsError('permission-denied', 'Brand membership required');
    if (previous.exists) {
      if (previous.get('submitted_by') !== caller.luid || previous.get('submission_hash') !== hash) throw new HttpsError('already-exists', 'Campaign ID in use');
      return { id, status: previous.get('status') };
    }
    if (Number(quota.get('count') ?? 0) >= 3) throw new HttpsError('resource-exhausted', 'Submission limit reached');
    tx.create(db.collection('campaigns').doc(id), { brand_id: brand.id, author_luid: brand.get('author_luid'), submission_hash: hash, name: b.name.trim(), message: b.message.trim(), terms: b.terms.trim(),
      lat: b.lat, lng: b.lng, radius: b.radius, minPosts: 0, minLikes: 0, starts_at: Timestamp.fromMillis(b.startsAt), ends_at: Timestamp.fromMillis(b.endsAt),
      status: 'draft', submitted_by: caller.luid, created_at: FieldValue.serverTimestamp() });
    tx.set(quota.ref, { owner_luid: caller.luid, count: Number(quota.get('count') ?? 0) + 1, expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
    return { id, status: 'draft' };
  });
});
