import { onSchedule } from 'firebase-functions/v2/scheduler';
import { bucket, db, deleteStoragePrefix, FieldValue, logger, Timestamp } from './core';
import { listCloudAnchors, type ManagementDeps } from './arcoreManagement';
import { deleteAnchorOrQueue, drainAnchorDeletionQueue } from './anchorQueue';
import { deleteAnchorOfPost } from './anchors';
import { selectOrphanAnchors } from './arcoreToken';
import { purgeStalePendingAvatars } from './avatar';

/**
 * Storage housekeeping so media does not accumulate for content nobody can see.
 *
 * 1. Removed posts: when a post becomes `removed` (author delete or moderator soft delete),
 *    onPostWritten queues its media in `media_purge_queue` with a 30-day grace period, so an
 *    accidental moderator removal can still be restored with its AR map. Restoring cancels it.
 * 2. Orphan uploads: world maps uploaded for a draft whose createPost never succeeded (app
 *    killed, offline forever, server rejection the client could not clean up) are deleted after
 *    48 hours if no post document exists for them.
 * 3. Profile photos uploaded to avatars/{luid}/pending/ but never screened: deleted after 48 hours.
 */

export const REMOVED_MEDIA_GRACE_DAYS = 30;
export const ORPHAN_UPLOAD_GRACE_HOURS = 48;
const BATCH = 300;
const DAY_MS = 86_400_000;

export const purgeQueueRef = (postId: string) => db.collection('media_purge_queue').doc(postId);

/** Called by onPostWritten on every status change. */
export async function schedulePurgeOnStatusChange(
  postId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
  now = Date.now(),
): Promise<void> {
  const wasRemoved = before?.status === 'removed';
  const isRemoved = after?.status === 'removed';
  if (isRemoved && !wasRemoved && after?.creator_id) {
    await purgeQueueRef(postId).set({
      post_id: postId,
      prefix: `${after.creator_id}/${postId}/`,
      due_at: Timestamp.fromMillis(now + REMOVED_MEDIA_GRACE_DAYS * DAY_MS),
    });
  } else if (wasRemoved && after && !isRemoved) {
    await purgeQueueRef(postId).delete();
  }
}

export async function purgeDueRemovedMedia(now = Date.now()): Promise<number> {
  const due = await db.collection('media_purge_queue')
    .where('due_at', '<=', Timestamp.fromMillis(now))
    .limit(BATCH)
    .get();
  for (const doc of due.docs) {
    const post = await db.collection('posts').doc(doc.id).get();
    // Restored in the meantime (queue entry left behind): keep the media.
    if (!post.exists || post.data()!.status === 'removed') {
      await deleteStoragePrefix(String(doc.data().prefix));
      if (post.exists) await deleteAnchorOfPost(post.data()!.cloud_anchor_id, post.id);
      // A later restore still works, but the post can only be shown approximately (no AR map).
      if (post.exists) await post.ref.update({ media_purged_at: FieldValue.serverTimestamp() });
    }
    await doc.ref.delete();
  }
  return due.size;
}

/** Deletes world-map folders older than the grace period that have no post document. */
export async function purgeOrphanUploads(now = Date.now()): Promise<number> {
  const [files] = await bucket().getFiles({ prefix: 'post-world-maps/', maxResults: 5000 });
  const newestByFolder = new Map<string, number>();
  for (const file of files) {
    const [, luid, postId] = file.name.split('/');
    if (!luid || !postId) continue;
    const key = `${luid}/${postId}`;
    const updated = Date.parse(String(file.metadata.updated ?? file.metadata.timeCreated ?? '')) || now;
    newestByFolder.set(key, Math.max(newestByFolder.get(key) ?? 0, updated));
  }
  const cutoff = now - ORPHAN_UPLOAD_GRACE_HOURS * 3_600_000;
  const candidates = [...newestByFolder].filter(([, updated]) => updated < cutoff).map(([key]) => key).slice(0, BATCH);
  if (candidates.length === 0) return 0;
  const posts = await db.getAll(...candidates.map((key) => db.collection('posts').doc(key.split('/')[1])));
  let removed = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (posts[i].exists) continue;
    await deleteStoragePrefix(`${candidates[i]}/`);
    removed++;
  }
  return removed;
}

/**
 * Orphan grace period: an anchor is hosted before the post is published, and the iOS offline
 * publish queue retries with no maximum age, so the grace must be generous. Posts older than
 * this that still reference nothing are treated as never published.
 */
export const ORPHAN_ANCHOR_GRACE_DAYS = 30;
const ORPHAN_CURSOR = () => db.collection('system').doc('arcore_orphan_cursor');

/** Anchor ids (of `ids`) that a post or an ownership record still claims. */
export async function referencedAnchorIds(ids: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (ids.length === 0) return referenced;
  const records = await db.getAll(...ids.map((id) => db.collection('cloud_anchors').doc(id)));
  records.forEach((r) => { if (r.exists && r.data()!.post_id) referenced.add(r.id); });
  const rest = ids.filter((id) => !referenced.has(id));
  for (let i = 0; i < rest.length; i += 30) {
    const chunk = rest.slice(i, i + 30);
    const snap = await db.collection('posts').where('cloud_anchor_id', 'in', chunk).select('cloud_anchor_id').get();
    snap.docs.forEach((d) => referenced.add(String(d.get('cloud_anchor_id'))));
  }
  return referenced;
}

/**
 * Deletes hosted Cloud Anchors that nothing references after the grace period. Resumes from a
 * stored page token (system/arcore_orphan_cursor) so every anchor is reached over a few nights
 * instead of the oldest pages being rescanned forever.
 */
export async function purgeOrphanCloudAnchors(now = Date.now(), maxPages = 5, deps: ManagementDeps = {}): Promise<number> {
  let removed = 0;
  const cursorSnap = await ORPHAN_CURSOR().get();
  let pageToken: string | undefined = (cursorSnap.data()?.page_token as string | undefined) || undefined;
  for (let page = 0; page < maxPages; page++) {
    let listed: Awaited<ReturnType<typeof listCloudAnchors>>;
    try {
      listed = await listCloudAnchors(pageToken, deps);
    } catch (error) {
      // A stored page token can expire; start from the first page next night instead of failing forever.
      if (pageToken) await ORPHAN_CURSOR().set({ page_token: null, reset_reason: String(error).slice(0, 200), updated_at: FieldValue.serverTimestamp() });
      throw error;
    }
    const { anchors, nextPageToken } = listed;
    if (anchors.length > 0) {
      const referenced = await referencedAnchorIds(anchors.map((a) => a.id));
      for (const id of selectOrphanAnchors(anchors, referenced, now, ORPHAN_ANCHOR_GRACE_DAYS * DAY_MS)) {
        if (await deleteAnchorOrQueue(id, deps)) removed++;
        await db.collection('cloud_anchors').doc(id).delete(); // unbound ownership record, if any
      }
    }
    pageToken = nextPageToken;
    if (!pageToken) break;
  }
  // Keep the position for the next run; wrap around after the last page.
  await ORPHAN_CURSOR().set({ page_token: pageToken ?? null, updated_at: FieldValue.serverTimestamp() });
  return removed;
}

export const cleanupPostMedia = onSchedule({ schedule: 'every day 03:17', timeZone: 'Europe/Istanbul', timeoutSeconds: 540 }, async () => {
  const removed = await purgeDueRemovedMedia();
  const orphans = await purgeOrphanUploads();
  let pendingAvatars = 0;
  try {
    pendingAvatars = await purgeStalePendingAvatars();
  } catch (error) {
    logger.error('pending_avatar_cleanup_failed', { error: String(error) });
  }
  let orphanAnchors = 0;
  let retried = 0;
  try {
    retried = await drainAnchorDeletionQueue();
  } catch (error) {
    logger.error('cloud_anchor_queue_failed', { error: String(error) });
  }
  try {
    orphanAnchors = await purgeOrphanCloudAnchors();
  } catch (error) {
    logger.error('cloud_anchor_cleanup_failed', { error: String(error) });
  }
  logger.info('cleanup_post_media', { removed, orphans, pendingAvatars, orphanAnchors, retried });
});

/**
 * Nightly sample check of denormalised counters (likes/comments/saves on posts). Redelivered
 * triggers are deduplicated, but a failed delivery could still leave a counter off; this repairs
 * a random sample of posts each night rather than scanning everything.
 */
export async function reconcileCounters(sampleSize = 100): Promise<number> {
  const startId = db.collection('posts').doc().id;
  let snap = await db.collection('posts').orderBy('__name__').startAt(startId).limit(sampleSize).get();
  if (snap.size < sampleSize) {
    const rest = await db.collection('posts').orderBy('__name__').limit(sampleSize - snap.size).get();
    snap = { docs: [...snap.docs, ...rest.docs.filter((d) => !snap.docs.some((x) => x.id === d.id))] } as typeof snap;
  }
  let repaired = 0;
  for (const post of snap.docs) {
    const [likes, comments, saves] = await Promise.all(['likes', 'comments', 'post_saves'].map(
      async (c) => (await db.collection(c).where('post_id', '==', post.id).count().get()).data().count,
    ));
    const data = post.data();
    const fix: Record<string, number> = {};
    if (Number(data.likes_count ?? 0) !== likes) fix.likes_count = likes;
    if (Number(data.comments_count ?? 0) !== comments) fix.comments_count = comments;
    if (Number(data.saves_count ?? 0) !== saves) fix.saves_count = saves;
    if (Object.keys(fix).length > 0) {
      await post.ref.update(fix);
      repaired++;
    }
  }
  return repaired;
}

export const reconcilePostCounters = onSchedule({ schedule: 'every day 04:11', timeZone: 'Europe/Istanbul', timeoutSeconds: 540 }, async () => {
  const repaired = await reconcileCounters();
  logger.info('reconcile_counters', { repaired });
});
