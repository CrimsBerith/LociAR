import { createHash } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { getMessaging, type TokenMessage } from 'firebase-admin/messaging';
import {
  assertServiceEnabled, CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, logger, requireCaller, Timestamp,
} from './core';
import { profileBlock } from './profileGuard';
import { reasonError } from './errors';

/**
 * Push notifications (Firebase Cloud Messaging → APNs). Device tokens live in
 * `push_devices/{sha256(token)}` = { luid, token, locale, updated_at, expires_at }: server-only
 * (firestore.rules default-deny), removed on sign-out (unregisterPushToken), on account deletion,
 * when FCM reports them dead, and by TTL after 60 days without a refresh.
 */
export const PUSH_TOKEN_TTL_DAYS = 60;
export const MAX_DEVICES_PER_USER = 10;
export const MAX_PUSHES_PER_HOUR = 20;
const TOKEN_PATTERN = /^[A-Za-z0-9_:\-.]{20,4096}$/;
const DAY_MS = 86_400_000;

export const deviceDocId = (token: string) => createHash('sha256').update(token).digest('hex');

export const registerPushToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  await assertServiceEnabled('push_register');
  const { token, locale } = (request.data ?? {}) as { token?: unknown; locale?: unknown };
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new HttpsError('invalid-argument', 'Invalid push token');
  const blocked = profileBlock((await db.collection('profiles').doc(caller.luid).get()).data());
  if (blocked) throw reasonError('permission-denied', blocked.message, blocked.reason);
  const ref = db.collection('push_devices').doc(deviceDocId(token));
  await ref.set({
    luid: caller.luid,
    token,
    platform: 'ios',
    locale: typeof locale === 'string' ? locale.slice(0, 16) : null,
    updated_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromMillis(Date.now() + PUSH_TOKEN_TTL_DAYS * DAY_MS),
  });
  // Keep the newest few devices per account; older registrations are dropped.
  const devices = await db.collection('push_devices').where('luid', '==', caller.luid).orderBy('updated_at', 'desc').get();
  await Promise.all(devices.docs.slice(MAX_DEVICES_PER_USER).map((d) => d.ref.delete()));
  return { registered: true };
});

export const unregisterPushToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const token = (request.data as { token?: unknown } | undefined)?.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new HttpsError('invalid-argument', 'Invalid push token');
  const ref = db.collection('push_devices').doc(deviceDocId(token));
  const snap = await ref.get();
  if (snap.exists && snap.data()!.luid === caller.luid) await ref.delete();
  return { unregistered: true };
});

export type PushKind = 'like' | 'comment' | 'follow';

/** APNs localization keys; the texts live in the app's Localizable.xcstrings (all 12 languages). */
export const PUSH_LOC_KEYS: Record<PushKind, string> = {
  like: 'push.like',
  comment: 'push.comment',
  follow: 'push.follow',
};

export type PushMessage = TokenMessage;

export function buildPushMessage(token: string, kind: PushKind, actorHandle: string, postId: string | null): PushMessage {
  const data: Record<string, string> = { kind };
  if (postId) data.post_id = postId;
  return {
    token,
    apns: { payload: { aps: { alert: { locKey: PUSH_LOC_KEYS[kind], locArgs: [`@${actorHandle}`] }, sound: 'default', threadId: kind } } },
    data,
  };
}

export type PushDeps = { send?: (message: PushMessage) => Promise<unknown> };
const realSend = (message: PushMessage) => getMessaging().send(message);
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

/**
 * Sends one activity notification to every registered device of `recipientId`, unless the
 * recipient blocked the actor or already received MAX_PUSHES_PER_HOUR this hour. Never throws:
 * a push failure must not fail the trigger that recorded the activity.
 */
export async function sendActivityPush(kind: PushKind, actorId: string, recipientId: string, postId: string | null, deps: PushDeps = {}): Promise<number> {
  try {
    if (actorId === recipientId) return 0;
    const inEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    if (inEmulator && !deps.send) return 0;
    const [block, devices, actor] = await Promise.all([
      db.collection('user_blocks').doc(`${recipientId}_${actorId}`).get(),
      db.collection('push_devices').where('luid', '==', recipientId).limit(MAX_DEVICES_PER_USER).get(),
      db.collection('profiles').doc(actorId).get(),
    ]);
    if (block.exists || devices.empty || !actor.exists) return 0;
    const quotaRef = db.collection('push_quota').doc(`${recipientId}_h${Math.floor(Date.now() / 3_600_000)}`);
    const allowed = await db.runTransaction(async (tx) => {
      const count = Number((await tx.get(quotaRef)).data()?.count ?? 0);
      if (count >= MAX_PUSHES_PER_HOUR) return false;
      tx.set(quotaRef, { owner_luid: recipientId, count: count + 1, expires_at: Timestamp.fromMillis(Date.now() + 2 * 3_600_000) }, { merge: true });
      return true;
    });
    if (!allowed) return 0;
    const handle = String(actor.data()!.handle ?? 'loci');
    const send = deps.send ?? realSend;
    let sent = 0;
    for (const device of devices.docs) {
      try {
        await send(buildPushMessage(String(device.data().token), kind, handle, postId));
        sent++;
      } catch (error) {
        const code = (error as { code?: string }).code ?? '';
        if (DEAD_TOKEN_CODES.has(code)) await device.ref.delete();
        else logger.warn('push_send_failed', { luid: recipientId, code });
      }
    }
    return sent;
  } catch (error) {
    logger.error('push_failed', { luid: recipientId, error: String(error) });
    return 0;
  }
}
