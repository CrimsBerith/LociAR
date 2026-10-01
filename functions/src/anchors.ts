import { onCall } from 'firebase-functions/v2/https';
import { db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, requireCaller, Timestamp } from './core';
import { reasonError } from './errors';
import { deleteAnchorOrQueue } from './anchorQueue';

/** Same alphabet as placement.ts CLOUD_ANCHOR_ID. */
export const CLOUD_ANCHOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const MAX_ANCHORS_PER_DAY = 100;

/**
 * Ownership records for hosted Cloud Anchors: `cloud_anchors/{id} = {owner_luid, post_id, ...}`.
 * Written only through the Admin SDK (clients are default-denied by firestore.rules). createPost
 * binds an anchor to exactly one post of its owner, and every delete path refuses an anchor that
 * is not bound to the post being deleted, so a leaked anchor id cannot be used to take over or
 * delete someone else's anchor.
 */
export const registerCloudAnchor = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  if (!identityVerified(caller)) {
    throw reasonError('permission-denied', 'A verified Apple or email identity is required', 'identity_unverified');
  }
  const id = (request.data as { cloudAnchorId?: unknown })?.cloudAnchorId;
  if (typeof id !== 'string' || !CLOUD_ANCHOR_ID_PATTERN.test(id)) throw new HttpsError('invalid-argument', 'Invalid cloud anchor');
  const ref = db.collection('cloud_anchors').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      // Idempotent for the owner; never re-assign an id that someone else registered.
      if (snap.data()!.owner_luid !== caller.luid) throw new HttpsError('already-exists', 'Cloud anchor is already registered');
      return;
    }
    tx.create(ref, { owner_luid: caller.luid, post_id: null, created_at: FieldValue.serverTimestamp() });
  });
  return { registered: true };
});

export type AnchorRecord = { owner_luid?: unknown; post_id?: unknown } | undefined;

/** Pure check used by createPost: record exists, belongs to the caller and is still unbound. */
export function anchorBindError(record: AnchorRecord, luid: string): string | null {
  if (!record) return 'Cloud anchor is not registered';
  if (record.owner_luid !== luid) return 'Cloud anchor belongs to another user';
  if (record.post_id != null) return 'Cloud anchor is already in use';
  return null;
}

/** Pure check used by delete paths: the anchor record must be bound to this very post. */
export function anchorDeletable(record: AnchorRecord, postId: string): boolean {
  return Boolean(record) && record!.post_id === postId;
}

/** Deletes the hosted anchor only when its ownership record is bound to `postId`. */
export async function deleteAnchorOfPost(anchorId: unknown, postId: string): Promise<boolean> {
  if (typeof anchorId !== 'string' || !anchorId) return false;
  const ref = db.collection('cloud_anchors').doc(anchorId);
  const snap = await ref.get();
  if (!anchorDeletable(snap.data(), postId)) return false;
  const deleted = await deleteAnchorOrQueue(anchorId);
  await ref.delete();
  return deleted;
}

export const HOURLY_POST_LIMIT = 10;
export const DAILY_POST_LIMIT = 50;

export function quotaDecision(hourly: number, daily: number): 'ok' | 'limited' {
  return hourly >= HOURLY_POST_LIMIT || daily >= DAILY_POST_LIMIT ? 'limited' : 'ok';
}

/**
 * Atomically consumes one post from the caller's hourly/daily quota. Returns `limited` (and,
 * for the first rejection of a window only, `flag: true`) instead of writing once per request.
 */
export async function consumePostQuota(luid: string, nowMs: number): Promise<{ ok: boolean; flag: boolean; hourly: number; daily: number }> {
  const hourRef = db.collection('post_quota').doc(`${luid}_h${Math.floor(nowMs / 3_600_000)}`);
  const dayRef = db.collection('post_quota').doc(`${luid}_d${Math.floor(nowMs / 86_400_000)}`);
  return db.runTransaction(async (tx) => {
    const [h, d] = await Promise.all([tx.get(hourRef), tx.get(dayRef)]);
    const hourly = Number(h.data()?.count ?? 0);
    const daily = Number(d.data()?.count ?? 0);
    if (quotaDecision(hourly, daily) === 'limited') {
      const flag = h.data()?.flagged !== true;
      if (flag) tx.set(hourRef, { owner_luid: luid, count: hourly, flagged: true, expires_at: Timestamp.fromMillis(nowMs + 2 * 3_600_000) }, { merge: true });
      return { ok: false, flag, hourly, daily };
    }
    tx.set(hourRef, { owner_luid: luid, count: hourly + 1, expires_at: Timestamp.fromMillis(nowMs + 2 * 3_600_000) }, { merge: true });
    tx.set(dayRef, { owner_luid: luid, count: daily + 1, expires_at: Timestamp.fromMillis(nowMs + 2 * 86_400_000) }, { merge: true });
    return { ok: true, flag: false, hourly: hourly + 1, daily: daily + 1 };
  });
}
