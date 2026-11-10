import { forEachSequential } from './async';
import { db, FieldValue, Timestamp } from './core';
import { isAccountDeleting } from './profileGuard';

export type CounterField = 'likes_count' | 'comments_count' | 'saves_count'
  | 'follower_count' | 'following_count' | 'public_post_count';
export type CounterRecount = { path: string; fields: CounterField[] };

export function engagementScore(views: unknown, likes: unknown, comments: unknown): number {
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  return count(views) + 3 * count(likes) + 5 * count(comments);
}

/** Existing manual edits cannot be converted to offsets without their original source counts. */
export function legacyManualMetrics(data: FirebaseFirestore.DocumentData): boolean {
  const offsets = data.metrics_counter_offsets;
  return Boolean(data.metrics_admin_edited_at || data.metrics_admin_edited_by)
    && !(offsets && Number.isSafeInteger(offsets.likes_count) && Number.isSafeInteger(offsets.comments_count));
}

export function isPublicActive(post: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(post?.status === 'active' && post.visibility === 'public' && post.age_rating !== '18_plus' && !post.deleted_at);
}

const COUNTER_SOURCES: Record<Exclude<CounterField, 'public_post_count'>, [string, string]> = {
  likes_count: ['likes', 'post_id'], comments_count: ['comments', 'post_id'], saves_count: ['post_saves', 'post_id'],
  following_count: ['follows', 'follower_id'], follower_count: ['follows', 'following_id'],
};

async function sourceCount(tx: FirebaseFirestore.Transaction, field: CounterField, targetId: string): Promise<number> {
  if (field === 'public_post_count') {
    // Legacy rows can omit deleted_at / age_rating, so those predicates run on selected fields.
    const posts = await tx.get(db.collection('posts').where('creator_id', '==', targetId)
      .where('status', '==', 'active').where('visibility', '==', 'public').select('status', 'visibility', 'age_rating', 'deleted_at', 'is_anonymous'));
    return posts.docs.filter(post => isPublicActive(post.data()) && post.get('is_anonymous') !== true).length;
  }
  const [collection, sourceField] = COUNTER_SOURCES[field];
  return (await tx.get(db.collection(collection).where(sourceField, '==', targetId).count())).data().count;
}

/** Reads live source rows at the transaction's snapshot, never a trigger's historical delta. */
export async function readCounterUpdate(
  tx: FirebaseFirestore.Transaction,
  target: FirebaseFirestore.DocumentSnapshot,
  fields: CounterField[],
): Promise<Record<string, number>> {
  if (!target.exists) return {};
  const data = target.data()!;
  const profile = target.ref.parent.id === 'profiles';
  const owner = profile ? target.id : data.creator_id;
  if (typeof owner === 'string' && await isAccountDeleting(tx, owner)) return {};
  const next: Record<string, number> = {};
  await forEachSequential(fields, async (field) => {
    if ((field === 'likes_count' || field === 'comments_count') && legacyManualMetrics(data)) return;
    const count = await sourceCount(tx, field, target.id);
    const offset = data.metrics_counter_offsets?.[field];
    next[field] = Math.max(0, count + (Number.isSafeInteger(offset) ? offset : 0));
  });
  if (!profile && fields.some((field) => field === 'likes_count' || field === 'comments_count')) {
    next.engagement_score = engagementScore(data.views_count, next.likes_count ?? data.likes_count, next.comments_count ?? data.comments_count);
  }
  return next;
}

/**
 * Deliveries are unordered and repeatable. Recount source rows in the receipt transaction so
 * delete→create delivery, quick toggles, expired receipts and nightly repairs converge on the
 * same current state. Filtered-comment markers are consumed in that same transaction: there
 * is no historical decrement to skip, and recount also repairs a temporarily counted comment
 * once moderation physically removes it.
 */
export async function applyCountersOnce(
  eventId: string,
  updates: CounterRecount[],
  uncountedMarker?: FirebaseFirestore.DocumentReference,
): Promise<boolean> {
  const receiptRef = db.collection('trigger_receipts').doc(eventId);
  return await db.runTransaction(async (tx) => {
    const [receipt, ...targets] = await tx.getAll(receiptRef,
      ...updates.map((update) => db.doc(update.path)), ...(uncountedMarker ? [uncountedMarker] : []));
    if (receipt.exists) return false;
    const marker = uncountedMarker ? targets.pop() : undefined;
    // Every read (including aggregates) must precede the first transaction write.
    const changes = await Promise.all(targets.map((target, i) => readCounterUpdate(tx, target, updates[i].fields)));
    if (marker?.exists) tx.delete(marker.ref);
    targets.forEach((target, i) => {
      if (Object.keys(changes[i]).length > 0) tx.update(target.ref, changes[i]);
    });
    tx.create(receiptRef, { created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    return !marker?.exists;
  });
}
