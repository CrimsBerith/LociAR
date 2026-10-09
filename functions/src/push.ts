import { createHash } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, requireCaller, Timestamp } from './core';

/**
 * Server push (growth plan 3.2). The iOS app registers its FCM token through `registerPushToken`;
 * the server sends a push for every new activity event (like, comment, follow) and when a post is
 * approved. Tokens live in push_tokens/{sha256(token)} (server-only, default-deny rules): one
 * document per token, so a device that signs in as another user changes owner instead of
 * delivering to the previous account.
 */
export const PUSH_DAILY_LIMIT = 3;
export const MAX_TOKENS_PER_USER = 5;

export function isPlausiblePushToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 20 && token.length <= 4096 && /^[A-Za-z0-9_\-:.]+$/.test(token);
}

export const pushTokenId = (token: string) => createHash('sha256').update(token).digest('hex');

/** UTC calendar day, e.g. 20261002; the daily push cap resets at 00:00 UTC. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
}

export type PushContent = { title: string; body: string; kind: string; postId?: string | null };

function clip(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return Array.from(text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, max).join('');
}

/** FCM message without tokens. `post_id` is what the app's notification-tap handler reads. */
export function buildPushMessage(content: PushContent) {
  const data: Record<string, string> = { type: content.kind };
  if (content.postId) data.post_id = content.postId;
  return {
    notification: { title: clip(content.title, 60) || 'LociAR', body: clip(content.body, 140) },
    data,
    apns: { payload: { aps: { sound: 'default' } } },
  };
}

export const registerPushToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const token = (request.data as { token?: unknown } | null)?.token;
  if (!isPlausiblePushToken(token)) throw new HttpsError('invalid-argument', 'Invalid push token');
  await db.collection('push_tokens').doc(pushTokenId(token)).set({
    owner_luid: caller.luid, token, platform: 'ios', updated_at: FieldValue.serverTimestamp(),
  });
  // Keep the newest tokens only (reinstalls and token refreshes leave old ones behind).
  const snap = await db.collection('push_tokens').where('owner_luid', '==', caller.luid).get();
  if (snap.size > MAX_TOKENS_PER_USER) {
    const oldestFirst = snap.docs.sort((a, b) => (a.get('updated_at')?.toMillis?.() ?? 0) - (b.get('updated_at')?.toMillis?.() ?? 0));
    await Promise.all(oldestFirst.slice(0, snap.size - MAX_TOKENS_PER_USER).map((d) => d.ref.delete()));
  }
  return { ok: true };
});

/** Signing out stops pushes for that account on this device; only the token's owner can remove it. */
export const unregisterPushToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  const token = (request.data as { token?: unknown } | null)?.token;
  if (!isPlausiblePushToken(token)) throw new HttpsError('invalid-argument', 'Invalid push token');
  const ref = db.collection('push_tokens').doc(pushTokenId(token));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('owner_luid') === caller.luid) tx.delete(ref);
  });
  return { ok: true };
});

/** Sends one push to every token of a user, at most PUSH_DAILY_LIMIT per user and day. Never throws. */
export async function notifyUser(luid: string, content: PushContent): Promise<void> {
  try {
    const tokens = await db.collection('push_tokens').where('owner_luid', '==', luid).limit(MAX_TOKENS_PER_USER).get();
    if (tokens.empty) return;

    const quotaRef = db.collection('push_quota').doc(`${luid}_${utcDay(Date.now())}`);
    const allowed = await db.runTransaction(async (tx) => {
      const count = Number((await tx.get(quotaRef)).get('count') ?? 0);
      if (count >= PUSH_DAILY_LIMIT) return false;
      tx.set(quotaRef, { owner_luid: luid, count: count + 1, expires_at: Timestamp.fromMillis(Date.now() + 3 * 86_400_000) }, { merge: true });
      return true;
    });
    if (!allowed) return;

    const result = await getMessaging().sendEachForMulticast({
      tokens: tokens.docs.map((d) => String(d.get('token'))),
      ...buildPushMessage(content),
    });
    await Promise.all(result.responses.map((response, i) => {
      const code = response.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        return tokens.docs[i].ref.delete();
      }
      return undefined;
    }));
  } catch (error) {
    console.error('push_failed', (error as Error).message);
  }
}

export async function notifyPostApproved(creatorLuid: string, postId: string): Promise<void> {
  await notifyUser(creatorLuid, { title: 'LociAR', body: 'Postun onaylandı ve yayında.', kind: 'post_approved', postId });
}

export const onActivityPush = onDocumentCreated('activity_events/{id}', async (event) => {
  const activity = event.data?.data();
  if (!activity || typeof activity.recipient_id !== 'string') return;
  const actor = typeof activity.actor_id === 'string' ? await db.collection('profiles').doc(activity.actor_id).get() : null;
  const handle = actor?.exists ? String(actor.get('handle') ?? '') : '';
  await notifyUser(activity.recipient_id, {
    title: handle ? `@${handle}` : 'LociAR',
    body: String(activity.body ?? ''),
    kind: String(activity.kind ?? 'activity'),
    postId: typeof activity.post_id === 'string' ? activity.post_id : null,
  });
});
