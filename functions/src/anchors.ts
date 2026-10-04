import { onCall } from 'firebase-functions/v2/https';
import { assertServiceEnabled, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, identityVerified, requireCaller, Timestamp } from './core';
import { reasonError, withContentionGuard } from './errors';
import { deleteAnchorOrQueue } from './anchorQueue';

/** Same alphabet as placement.ts CLOUD_ANCHOR_ID. */
export const CLOUD_ANCHOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const MAX_ANCHORS_PER_DAY = 100;
/**
 * Unbound ownership records expire (Firestore TTL on expires_at); createPost clears the field.
 * Same length as the orphan grace in cleanup.ts (ORPHAN_ANCHOR_GRACE_DAYS), because a post can
 * wait that long in the iOS offline publish queue before it binds its anchor.
 */
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
    const [snap, quota] = await Promise.all([tx.get(ref), tx.get(quotaRef)]);
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

export const MAX_POSTS_NEARBY = 5;

export type PostAdmission = { ok: boolean; reason: 'rate' | 'density' | null; flag: boolean; hourly: number; daily: number; density: number };

const postQuotaRefs = (luid: string, nowMs: number) => ({
  hourRef: db.collection('post_quota').doc(`${luid}_h${Math.floor(nowMs / 3_600_000)}`),
  dayRef: db.collection('post_quota').doc(`${luid}_d${Math.floor(nowMs / 86_400_000)}`),
});

/**
 * Atomically checks the caller's hourly/daily quota and the nearby post density, and consumes one
 * post on success. `countNearby` runs its queries through the same transaction, so parallel
 * publishes in one spot cannot all pass the density check. A rejection asks for a moderation flag
 * (`flag: true`) only once per hour window and reason, instead of once per request.
 */
export async function consumePostQuota(
  luid: string,
  nowMs: number,
  countNearby: (tx: FirebaseFirestore.Transaction) => Promise<number> = async () => 0,
): Promise<PostAdmission> {
  const { hourRef, dayRef } = postQuotaRefs(luid, nowMs);
  return withContentionGuard(() => db.runTransaction(async (tx) => {
    const [h, d] = await Promise.all([tx.get(hourRef), tx.get(dayRef)]);
    const hourly = Number(h.data()?.count ?? 0);
    const daily = Number(d.data()?.count ?? 0);
    const hourExpiry = Timestamp.fromMillis(nowMs + 2 * 3_600_000);
    if (quotaDecision(hourly, daily) === 'limited') {
      const flag = h.data()?.flagged !== true;
      if (flag) tx.set(hourRef, { owner_luid: luid, count: hourly, flagged: true, expires_at: hourExpiry }, { merge: true });
      return { ok: false, reason: 'rate', flag, hourly, daily, density: 0 };
    }
    const density = await countNearby(tx);
    if (density >= MAX_POSTS_NEARBY) {
      const flag = h.data()?.density_flagged !== true;
      if (flag) tx.set(hourRef, { owner_luid: luid, count: hourly, density_flagged: true, expires_at: hourExpiry }, { merge: true });
      return { ok: false, reason: 'density', flag, hourly, daily, density };
    }
    tx.set(hourRef, { owner_luid: luid, count: hourly + 1, expires_at: hourExpiry }, { merge: true });
    tx.set(dayRef, { owner_luid: luid, count: daily + 1, expires_at: Timestamp.fromMillis(nowMs + 2 * 86_400_000) }, { merge: true });
    return { ok: true, reason: null, flag: false, hourly: hourly + 1, daily: daily + 1, density };
  }));
}

/**
 * Failed publishes (invalid anchor, placement error) get their slot back, but only a few times
 * per hour: every attempt still runs the density queries, so unlimited refunds would let a client
 * hammer createPost for free.
 */
export const MAX_REFUNDS_PER_HOUR = 3;

/** Gives back a slot taken by consumePostQuota when the post was not created after all. */
export async function refundPostQuota(luid: string, nowMs: number): Promise<boolean> {
  const { hourRef, dayRef } = postQuotaRefs(luid, nowMs);
  return db.runTransaction(async (tx) => {
    const [h, d] = await Promise.all([tx.get(hourRef), tx.get(dayRef)]);
    const refunds = Number(h.data()?.refunds ?? 0);
    if (!h.exists || refunds >= MAX_REFUNDS_PER_HOUR) return false;
    tx.update(hourRef, { count: Math.max(0, Number(h.data()!.count ?? 0) - 1), refunds: refunds + 1 });
    if (d.exists) tx.update(dayRef, { count: Math.max(0, Number(d.data()!.count ?? 0) - 1) });
    return true;
  });
}
