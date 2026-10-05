import { onCall } from 'firebase-functions/v2/https';
import { assertServiceEnabled, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, requireCaller, Timestamp } from './core';
import { reasonError, withContentionGuard } from './errors';
import { deleteAnchorOrQueue, anchorDeletionRef } from './anchorQueue';
import { requireActiveAccount } from './profileGuard';

/** Same alphabet as placement.ts CLOUD_ANCHOR_ID. */
export const CLOUD_ANCHOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const MAX_ANCHORS_PER_DAY = 100;
/** Unbound ownership records expire (Firestore TTL on expires_at); createPost clears the field. */
export const UNBOUND_ANCHOR_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Ownership records for hosted Cloud Anchors: `cloud_anchors/{id} = {owner_luid, post_id, ...}`.
 * Written only through the Admin SDK (clients are default-denied by firestore.rules). createPost
 * binds an anchor to exactly one post of its owner, and every delete path refuses an anchor that
 * is not bound to the post being deleted, so a leaked anchor id cannot be used to take over or
 * delete someone else's anchor.
 */
export const registerCloudAnchor = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  await assertServiceEnabled('register_anchor');
  if (!identityVerified(caller)) {
    throw reasonError('permission-denied', 'A verified Apple or email identity is required', 'identity_unverified');
  }
  const id = (request.data as { cloudAnchorId?: unknown })?.cloudAnchorId;
  if (typeof id !== 'string' || !CLOUD_ANCHOR_ID_PATTERN.test(id)) throw new HttpsError('invalid-argument', 'Invalid cloud anchor');
  const ref = db.collection('cloud_anchors').doc(id);
  const now = Date.now();
  // Daily registration quota, counted in the same transaction as the create so parallel calls
  // cannot exceed it. Idempotent re-registration by the owner does not consume a slot.
  const quotaRef = db.collection('anchor_quota').doc(`${caller.luid}_d${Math.floor(now / DAY_MS)}`);
  const limited = await withContentionGuard(() => db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, caller.luid);
    const [snap, quota] = await Promise.all([tx.get(ref), tx.get(quotaRef)]);
    const deletion = await tx.get(anchorDeletionRef(id));
    if (deletion.exists || snap.get('state') === 'deleting' || snap.get('state') === 'deleted') throw new HttpsError('failed-precondition', 'Cloud anchor is being reclaimed');
    if (snap.exists) {
      // Idempotent for the owner; never re-assign an id that someone else registered.
      if (snap.data()!.owner_luid !== caller.luid) throw new HttpsError('already-exists', 'Cloud anchor is already registered');
      return false;
    }
    const count = Number(quota.data()?.count ?? 0);
    if (count >= MAX_ANCHORS_PER_DAY) return true;
    tx.set(quotaRef, { owner_luid: caller.luid, count: count + 1, expires_at: Timestamp.fromMillis(now + 2 * DAY_MS) }, { merge: true });
    tx.create(ref, {
      owner_luid: caller.luid,
      post_id: null,
      created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(now + UNBOUND_ANCHOR_TTL_DAYS * DAY_MS),
    });
    return false;
  }));
  if (limited) throw reasonError('resource-exhausted', 'Cloud anchor limit reached', 'rate_limited');
  return { registered: true };
});

export type AnchorRecord = { owner_luid?: unknown; post_id?: unknown; state?: unknown } | undefined;

/** Pure check used by createPost: record exists, belongs to the caller and is still unbound. */
export function anchorBindError(record: AnchorRecord, luid: string): string | null {
  if (!record) return 'Cloud anchor is not registered';
  if (record.owner_luid !== luid) return 'Cloud anchor belongs to another user';
  if (record.state === 'deleting' || record.state === 'deleted') return 'Cloud anchor is being reclaimed';
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
  const claimed = await claimAnchorDeletion(anchorId, postId);
  if (!claimed) return false;
  const deleted = await deleteAnchorOrQueue(anchorId);
  if (deleted) await ref.set({ state: 'deleted', post_id: postId, deleted_at: FieldValue.serverTimestamp() }, { merge: true });
  return deleted;
}

export const HOURLY_POST_LIMIT = 10;
export const DAILY_POST_LIMIT = 50;

export function quotaDecision(hourly: number, daily: number): 'ok' | 'limited' {
  return hourly >= HOURLY_POST_LIMIT || daily >= DAILY_POST_LIMIT ? 'limited' : 'ok';
}

export const MAX_POSTS_NEARBY = 5;

export type PostAdmission = { ok: boolean; reason: 'rate' | 'density' | null; flag: boolean; hourly: number; daily: number; density: number };

const postQuotaRefs = (luid: string, nowMs: number) => ({
  hourRef: db.collection('post_quota').doc(`${luid}_h${Math.floor(nowMs / 3_600_000)}`),
  dayRef: db.collection('post_quota').doc(`${luid}_d${Math.floor(nowMs / 86_400_000)}`),
});

/**
 * Admission must be called from the transaction that creates the post, after reading its
 * identity, anchor and spatial locks. Both quota increments then commit with the insert;
 * failed/replayed inserts never reserve a slot and never need a compensating refund.
 * Rejections flag at most once per caller, hour and reason.
 */
export async function admitPost(
  tx: FirebaseFirestore.Transaction,
  luid: string,
  nowMs: number,
  countNearby: () => Promise<number>,
): Promise<PostAdmission> {
  const { hourRef, dayRef } = postQuotaRefs(luid, nowMs);
  const [h, d] = await Promise.all([tx.get(hourRef), tx.get(dayRef)]);
  const hourly = Number(h.data()?.count ?? 0);
  const daily = Number(d.data()?.count ?? 0);
  const hourExpiry = Timestamp.fromMillis(nowMs + 2 * 3_600_000);
  if (quotaDecision(hourly, daily) === 'limited') {
    const flag = h.data()?.flagged !== true;
    if (flag) tx.set(hourRef, { owner_luid: luid, count: hourly, flagged: true, expires_at: hourExpiry }, { merge: true });
    return { ok: false, reason: 'rate', flag, hourly, daily, density: 0 };
  }
  const density = await countNearby();
  if (density >= MAX_POSTS_NEARBY) {
    const flag = h.data()?.density_flagged !== true;
    if (flag) tx.set(hourRef, { owner_luid: luid, count: hourly, density_flagged: true, expires_at: hourExpiry }, { merge: true });
    return { ok: false, reason: 'density', flag, hourly, daily, density };
  }
  tx.set(hourRef, { owner_luid: luid, count: hourly + 1, expires_at: hourExpiry }, { merge: true });
  tx.set(dayRef, { owner_luid: luid, count: daily + 1, expires_at: Timestamp.fromMillis(nowMs + 2 * 86_400_000) }, { merge: true });
  return { ok: true, reason: null, flag: false, hourly: hourly + 1, daily: daily + 1, density };
}

/** Reclamation and publication contend on the same ownership document. The tombstone must
 * survive remote deletion and every retry, so the provider ID can never be re-bound. */
export async function claimAnchorDeletion(anchorId: string, postId: string | null): Promise<boolean> {
  const ref = db.collection('cloud_anchors').doc(anchorId);
  return db.runTransaction(async tx => {
    const [record, queue] = await tx.getAll(ref, anchorDeletionRef(anchorId));
    const posts = await tx.get(db.collection('posts').where('cloud_anchor_id', '==', anchorId).limit(2));
    if (postId == null) {
      if (record.get('post_id') != null || !posts.empty) return false;
    } else if (!anchorDeletable(record.data(), postId)) return false;
    if (record.get('state') === 'deleted') return false;
    tx.set(ref, { state: 'deleting', post_id: postId, expires_at: FieldValue.delete(), deletion_claimed_at: FieldValue.serverTimestamp() }, { merge: true });
    if (!queue.exists) tx.create(queue.ref, { next_at: Timestamp.now(), attempts: 0, created_at: FieldValue.serverTimestamp() });
    return true;
  });
}
