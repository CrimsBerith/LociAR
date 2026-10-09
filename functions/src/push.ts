import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { assertServiceEnabled, CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, isUUID, requireCaller, Timestamp } from './core';
import { assertAccountNotDeleting, accountDeletionRef, profileBlock } from './profileGuard';
import { reasonError } from './errors';
import { invalidPushTokenCode, MAX_PUSH_DEVICES, postApprovedBody, pushBody, pushDeliveryId, pushLocale, pushQuotaDecision, pushQuotaId, PUSH_QUOTA_RETENTION_DAYS, PUSH_RECEIPT_RETENTION_DAYS, PUSH_TOKEN_RETENTION_DAYS, pushTokenId, utcDay, validPushToken } from './pushPolicy';

type Registration = { token?: unknown; installationId?: unknown; userId?: unknown; locale?: unknown };
const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };

function registrationIdentity(data: Registration | null, luid: string): string {
  if (!isUUID(data?.installationId)) throw new HttpsError('invalid-argument', 'Valid installationId required');
  // Binds a queued request to its intended session even if Auth changes while the SDK fetches a token.
  if (data?.userId !== luid) throw new HttpsError('permission-denied', 'Push session changed');
  return data.installationId.toLowerCase();
}

export const registerPushToken = onCall(options, async request => {
  const caller = requireCaller(request);
  await assertServiceEnabled('push_register');
  const data = request.data as Registration | null;
  const installationId = registrationIdentity(data, caller.luid);
  if (!identityVerified(caller)) throw reasonError('permission-denied', 'Verified identity required', 'identity_unverified');
  if (!validPushToken(data?.token)) throw new HttpsError('invalid-argument', 'Valid FCM token required');
  const token = data.token;
  const ref = db.collection('push_tokens').doc(pushTokenId(token));
  await db.runTransaction(async tx => {
    await assertAccountNotDeleting(tx, caller.luid);
    const [profile, previous] = await tx.getAll(db.collection('profiles').doc(caller.luid), ref);
    const blocked = profileBlock(profile.data());
    if (blocked) throw reasonError('permission-denied', blocked.message, blocked.reason);
    const owned = await tx.get(db.collection('push_tokens').where('owner_luid', '==', caller.luid).limit(MAX_PUSH_DEVICES + 1));
    const kept = owned.docs.filter(d => d.id !== ref.id && d.get('installation_id') !== installationId);
    if (kept.length >= MAX_PUSH_DEVICES) throw reasonError('resource-exhausted', 'Too many push devices', 'rate_limited');
    // Rotation removes this account's older token on the same installation. A global token hash
    // also makes an account switch an atomic ownership transfer, with no duplicate targets.
    for (const doc of owned.docs) {
      if (doc.id !== ref.id && doc.get('installation_id') === installationId) tx.delete(doc.ref);
    }
    tx.set(ref, {
      owner_luid: caller.luid, installation_id: installationId, token, locale: pushLocale(data?.locale),
      created_at: previous.get('created_at') ?? FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + PUSH_TOKEN_RETENTION_DAYS * 86_400_000),
    });
  });
  return { ok: true };
});

export const unregisterPushToken = onCall(options, async request => {
  const caller = requireCaller(request);
  const installationId = registrationIdentity(request.data as Registration | null, caller.luid);
  // Cleanup remains available to suspended/deleting accounts. Other accounts' tokens are untouched.
  await db.runTransaction(async tx => {
    const owned = await tx.get(db.collection('push_tokens').where('owner_luid', '==', caller.luid));
    for (const doc of owned.docs) if (doc.get('installation_id') === installationId) tx.delete(doc.ref);
  });
  return { ok: true };
});

export type PushSender = (message: Message) => Promise<string>;

/** One best-effort send attempt per activity/device. The claim is committed BEFORE calling FCM:
 * concurrent/redelivered events cannot send twice. A crash at the external boundary may lose a
 * push; the durable activity feed remains available. FCM is not a transactional Firestore service.
 */
export async function deliverActivityPush(activityId: string, send: PushSender, now = Date.now()): Promise<number> {
  const activityRef = db.collection('activity_events').doc(activityId);
  const initial = (await activityRef.get()).data();
  if (!initial || !isUUID(initial.actor_id) || !isUUID(initial.recipient_id)
    || initial.actor_id === initial.recipient_id || !pushBody(initial.kind, 'en')) return 0;
  const devices = await db.collection('push_tokens').where('owner_luid', '==', initial.recipient_id).limit(MAX_PUSH_DEVICES).get();
  let attempts = 0;
  for (const device of devices.docs) {
    const receiptRef = db.collection('push_delivery_receipts').doc(pushDeliveryId(activityId, device.id));
    const quotaRef = db.collection('push_quota').doc(pushQuotaId(initial.recipient_id, now));
    const claimed = await db.runTransaction(async tx => {
      const refs = [activityRef, device.ref, receiptRef,
        db.collection('profiles').doc(initial.recipient_id), db.collection('profiles').doc(initial.actor_id),
        db.collection('user_blocks').doc(`${initial.recipient_id}_${initial.actor_id}`),
        db.collection('user_blocks').doc(`${initial.actor_id}_${initial.recipient_id}`),
        accountDeletionRef(initial.recipient_id), accountDeletionRef(initial.actor_id), quotaRef];
      if (isUUID(initial.post_id)) refs.push(db.collection('posts').doc(initial.post_id));
      const [activitySnap, target, receipt, recipient, actor, blockA, blockB, recipientDeletion, actorDeletion, quota, post] = await tx.getAll(...refs);
      const activity = activitySnap.data();
      const body = pushBody(String(activity?.kind), target.get('locale'));
      if (!activity || activity.recipient_id !== initial.recipient_id || activity.actor_id !== initial.actor_id
        || activity.post_id !== initial.post_id || activity.kind !== initial.kind
        || (activity.expires_at instanceof Timestamp && activity.expires_at.toMillis() <= now)
        || activity.read_at || !body || receipt.exists || !target.exists
        || target.get('owner_luid') !== initial.recipient_id || !validPushToken(target.get('token'))
        || !(target.get('expires_at') instanceof Timestamp) || target.get('expires_at').toMillis() <= now
        || profileBlock(recipient.data()) || profileBlock(actor.data()) || blockA.exists || blockB.exists
        || recipientDeletion.exists || actorDeletion.exists) return null;
      if (activity.kind !== 'follow' && (!post?.exists || post.get('creator_id') !== initial.recipient_id
        || post.get('status') !== 'active' || post.get('deleted_at'))) return null;
      // At most PUSH_DAILY_LIMIT engagement pushes per recipient and UTC day; the feed still shows the rest.
      const quotaDecision = pushQuotaDecision(quota.data(), activityId);
      if (!quotaDecision.allow) return null;
      if (quotaDecision.next) {
        tx.set(quotaRef, {
          owner_luid: initial.recipient_id, day: utcDay(now), ...quotaDecision.next,
          expires_at: Timestamp.fromMillis(now + PUSH_QUOTA_RETENTION_DAYS * 86_400_000),
        });
      }
      tx.create(receiptRef, {
        owner_luid: initial.recipient_id, activity_id: activityId, status: 'attempted',
        created_at: FieldValue.serverTimestamp(),
        expires_at: Timestamp.fromMillis(now + PUSH_RECEIPT_RETENTION_DAYS * 86_400_000),
      });
      return {
        token: target.get('token') as string,
        notification: { title: 'LociAR', body },
        data: { activity_id: activityId, recipient_id: initial.recipient_id, post_id: isUUID(activity.post_id) ? activity.post_id : '' },
        apns: { headers: { 'apns-collapse-id': pushTokenId(activityId), 'apns-expiration': String(Math.floor(now / 1000) + 3600) }, payload: { aps: { sound: 'default' } } },
      } satisfies Message;
    });
    if (!claimed) continue;
    attempts++;
    try {
      await send(claimed);
      await receiptRef.update({ status: 'sent' }).catch(error => { if (error.code !== 5) throw error; });
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unknown';
      // A stale failure must never delete a token which was transferred to another account.
      if (invalidPushTokenCode(code)) {
        await db.runTransaction(async tx => {
          const latest = await tx.get(device.ref);
          if (latest.get('owner_luid') === initial.recipient_id && latest.get('token') === claimed.token) tx.delete(device.ref);
        });
      }
      await receiptRef.update({ status: 'failed', error_code: code }).catch(updateError => { if (updateError.code !== 5) throw updateError; });
      console.warn('push_send_failed', { code }); // Never log a token, FCM payload or user content.
    }
  }
  return attempts;
}

/**
 * One best-effort "your post is live" push per device when a moderator approves a post
 * (pending_review -> active). Same claim-before-send contract as activity pushes; exempt from the
 * daily engagement cap. The payload carries no caption, handle or location.
 */
export async function deliverPostApprovedPush(postId: string, send: PushSender, now = Date.now()): Promise<number> {
  if (!isUUID(postId)) return 0;
  const postRef = db.collection('posts').doc(postId);
  const initial = (await postRef.get()).data();
  const recipientId = initial?.creator_id;
  if (!initial || !isUUID(recipientId) || initial.status !== 'active' || initial.deleted_at) return 0;
  const deliveryKey = `post_approved_${postId}`;
  const devices = await db.collection('push_tokens').where('owner_luid', '==', recipientId).limit(MAX_PUSH_DEVICES).get();
  let attempts = 0;
  for (const device of devices.docs) {
    const receiptRef = db.collection('push_delivery_receipts').doc(pushDeliveryId(deliveryKey, device.id));
    const claimed = await db.runTransaction(async tx => {
      const [post, target, receipt, recipient, recipientDeletion] = await tx.getAll(
        postRef, device.ref, receiptRef, db.collection('profiles').doc(recipientId), accountDeletionRef(recipientId));
      if (!post.exists || post.get('creator_id') !== recipientId || post.get('status') !== 'active' || post.get('deleted_at')
        || receipt.exists || !target.exists || target.get('owner_luid') !== recipientId || !validPushToken(target.get('token'))
        || !(target.get('expires_at') instanceof Timestamp) || target.get('expires_at').toMillis() <= now
        || profileBlock(recipient.data()) || recipientDeletion.exists) return null;
      tx.create(receiptRef, {
        owner_luid: recipientId, activity_id: deliveryKey, status: 'attempted',
        created_at: FieldValue.serverTimestamp(),
        expires_at: Timestamp.fromMillis(now + PUSH_RECEIPT_RETENTION_DAYS * 86_400_000),
      });
      return {
        token: target.get('token') as string,
        notification: { title: 'LociAR', body: postApprovedBody(target.get('locale')) },
        // No activity_id: the client opens the post directly.
        data: { recipient_id: recipientId, post_id: postId },
        apns: { headers: { 'apns-collapse-id': pushTokenId(deliveryKey), 'apns-expiration': String(Math.floor(now / 1000) + 86_400) }, payload: { aps: { sound: 'default' } } },
      } satisfies Message;
    });
    if (!claimed) continue;
    attempts++;
    try {
      await send(claimed);
      await receiptRef.update({ status: 'sent' }).catch(error => { if (error.code !== 5) throw error; });
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unknown';
      if (invalidPushTokenCode(code)) {
        await db.runTransaction(async tx => {
          const latest = await tx.get(device.ref);
          if (latest.get('owner_luid') === recipientId && latest.get('token') === claimed.token) tx.delete(device.ref);
        });
      }
      await receiptRef.update({ status: 'failed', error_code: code }).catch(updateError => { if (updateError.code !== 5) throw updateError; });
      console.warn('push_send_failed', { code });
    }
  }
  return attempts;
}

export const onActivityCreated = onDocumentCreated('activity_events/{activityId}', async event => {
  // FCM has no local emulator. Demo activity must never reach the live messaging API.
  if (process.env.FUNCTIONS_EMULATOR === 'true') return;
  await deliverActivityPush(event.params.activityId, message => getMessaging().send(message));
});
