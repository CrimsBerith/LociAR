import { forEachSequential } from './async';
import { reconcileCounters, reconcileProfileCounters } from './reconciliation';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { randomUUID } from 'node:crypto';
import { db, deleteStoragePrefix, FieldValue, isUUID, Timestamp, logger, safeErrorCode } from './core';

import { purgeOrphanUploads } from './orphanUploadStorage';
export { purgeOrphanUploads } from './orphanUploadStorage';
export { ORPHAN_UPLOAD_GRACE_HOURS } from './orphanUploads';
import { listCloudAnchors, type ManagementDeps } from './arcoreManagement';
import { deleteAnchorOrQueue, drainAnchorDeletionQueue } from './anchorQueue';
import { claimAnchorDeletion, deleteAnchorOfPost } from './anchors';
import { selectOrphanAnchors } from './arcoreToken';
import { drainAvatarDeletions, purgeStalePendingAvatars } from './avatar';

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
const BATCH = 300;
const DAY_MS = 86_400_000;

export const purgeQueueRef = (postId: string) => db.collection('media_purge_queue').doc(postId);

/** Called by onPostWritten on every status change. */
export async function schedulePurgeOnStatusChange(
  postId: string,
  _before: FirebaseFirestore.DocumentData | undefined,
  _after: FirebaseFirestore.DocumentData | undefined,
  now = Date.now(),
): Promise<void> {
  // Trigger payloads can arrive out of order; decide from current state in the same transaction
  // that writes the queue. Account deletion reads are also fenced against delayed deliveries.
  await db.runTransaction(async (tx) => {
    const queueRef = purgeQueueRef(postId);
    const [post, queued] = await tx.getAll(db.collection('posts').doc(postId), queueRef);
    const data = post.data();
    if (!post.exists || data?.status !== 'removed' || typeof data.creator_id !== 'string') {
      if (queued.exists) tx.delete(queueRef);
      return;
    }
    const [profile, deletion] = await tx.getAll(
      db.collection('profiles').doc(data.creator_id), db.collection('account_deletion_jobs').doc(data.creator_id),
    );
    if (deletion.exists || profile.get('deleted_at') != null) {
      if (queued.exists) tx.delete(queueRef);
      return;
    }
    const due = now + REMOVED_MEDIA_GRACE_DAYS * DAY_MS;
    const existingDue = queued.get('due_at')?.toMillis?.();
    const dueAt = Number.isFinite(existingDue) ? Math.min(due, existingDue) : due;
    tx.set(queueRef, {
      post_id: postId, prefix: `${data.creator_id}/${postId}/`, due_at: Timestamp.fromMillis(dueAt),
    }, { merge: true }); // Delayed status events must not discard an in-flight purge lease.
  });
}

const PURGE_LEASE_MS = 15 * 60_000; // Longer than the 540-second worker deadline.

export async function purgeDueRemovedMedia(now = Date.now(), maxJobs = BATCH): Promise<number> {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > BATCH) throw new Error('Invalid purge job budget');
  const due = await db.collection('media_purge_queue')
    .where('due_at', '<=', Timestamp.fromMillis(now))
    .orderBy('due_at').limit(maxJobs)
    .get();
  let completed = 0;
  await forEachSequential(due.docs, async (doc) => {
    const owner = randomUUID(), postRef = db.collection('posts').doc(doc.id);
    try {
      const job = await db.runTransaction(async tx => {
        const [current, post] = await tx.getAll(doc.ref, postRef);
        const deadline = current.get('due_at'), lease = current.get('lease_until');
        if (!current.exists || !(deadline instanceof Timestamp) || deadline.toMillis() > now
          || lease instanceof Timestamp && lease.toMillis() > now) return null;
        if (post.exists && post.get('status') !== 'removed') { tx.delete(current.ref); return null; }
        const prefix = current.get('prefix'), creator = typeof prefix === 'string' ? prefix.split('/')[0] : null;
        if (!isUUID(creator) || !isUUID(doc.id) || prefix !== `${creator}/${doc.id}/`
          || post.exists && post.get('creator_id') !== creator) throw new Error('Invalid purge identity');
        tx.update(current.ref, { claim_id: owner, lease_until: Timestamp.fromMillis(now + PURGE_LEASE_MS) });
        if (post.exists) tx.update(postRef, { media_purge_state: 'purging' });
        return { prefix: prefix as string, creator, anchor: post.get('cloud_anchor_id') };
      });
      if (!job) return;
      // External I/O runs after the claim commits, never inside a retryable transaction.
      await deleteStoragePrefix(job.prefix);
      await deleteAnchorOfPost(job.anchor, doc.id);
      await db.runTransaction(async tx => {
        const [current, post] = await tx.getAll(doc.ref, postRef);
        if (!current.exists || current.get('claim_id') !== owner) return;
        if (post.exists && post.get('creator_id') === job.creator) tx.update(postRef, {
          media_purge_state: 'purged', media_purged_at: FieldValue.serverTimestamp(),
        });
        tx.delete(current.ref);
      });
      completed++;
    } catch (error) {
      await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (!current.exists || current.get('claim_id') != null && current.get('claim_id') !== owner) return;
        tx.update(doc.ref, { claim_id: FieldValue.delete(), lease_until: FieldValue.delete(),
          due_at: Timestamp.fromMillis(now + PURGE_LEASE_MS), last_error: 'retryable_operation_failed' });
      });
      logger.error('removed_media_purge_deferred', { code: safeErrorCode(error) });
    }
  });
  return completed;
}

/** Resume partial/abandoned purges without waiting for the nightly orphan scan. */
export const retryRemovedMedia = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Europe/Istanbul',
  timeoutSeconds: 540, maxInstances: 1 }, async () => { await purgeDueRemovedMedia(Date.now(), 20); });

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
      if (pageToken) await ORPHAN_CURSOR().set({ page_token: null, reset_reason: 'listing_failed', updated_at: FieldValue.serverTimestamp() });
      throw error;
    }
    const { anchors, nextPageToken } = listed;
    if (anchors.length > 0) {
      const referenced = await referencedAnchorIds(anchors.map((a) => a.id));
      await forEachSequential(selectOrphanAnchors(anchors, referenced, now, ORPHAN_ANCHOR_GRACE_DAYS * DAY_MS), async (id) => {
        if (!await claimAnchorDeletion(id, null)) return;
        if (await deleteAnchorOrQueue(id, deps)) {
          removed++;
          await db.collection('cloud_anchors').doc(id).set({ state: 'deleted', deleted_at: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
    }
    pageToken = nextPageToken;
    if (!pageToken) break;
  }
  // Keep the position for the next run; wrap around after the last page.
  await ORPHAN_CURSOR().set({ page_token: pageToken ?? null, updated_at: FieldValue.serverTimestamp() });
  return removed;
}

export const cleanupPostMedia = onSchedule({ schedule: 'every day 03:17', timeZone: 'Europe/Istanbul', timeoutSeconds: 540 }, async () => {
  let removed = 0, orphans = 0;
  await forEachSequential([async () => { removed = await purgeDueRemovedMedia(); }, async () => { orphans = await purgeOrphanUploads(); }, async () => { await drainAvatarDeletions(); }], async (task) => {
    try { await task(); } catch (error) { logger.error('media_cleanup_deferred', { code: safeErrorCode(error) }); }
  });
  let pendingAvatars = 0;
  try {
    pendingAvatars = await purgeStalePendingAvatars();
  } catch (error) {
    logger.error('pending_avatar_cleanup_failed', { code: safeErrorCode(error) });
  }
  let orphanAnchors = 0;
  let retried = 0;
  try {
    retried = await drainAnchorDeletionQueue();
  } catch (error) {
    logger.error('cloud_anchor_queue_failed', { code: safeErrorCode(error) });
  }
  try {
    orphanAnchors = await purgeOrphanCloudAnchors();
  } catch (error) {
    logger.error('cloud_anchor_cleanup_failed', { code: safeErrorCode(error) });
  }
  logger.info('cleanup_post_media', { removed, orphans, pendingAvatars, orphanAnchors, retried });
});

/** Nightly cursor-based repair reaches posts and profiles over successive runs. */
export { reconcileCounters, reconcileProfileCounters } from './reconciliation';

export const reconcilePostCounters = onSchedule({ schedule: 'every day 04:11', timeZone: 'Europe/Istanbul', timeoutSeconds: 540 }, async () => {
  const repaired = await reconcileCounters();
  const profilesRepaired = await reconcileProfileCounters();
  logger.info('reconcile_counters', { repaired, profilesRepaired });
});

/** Short, bounded retry worker for immutable avatar deletion jobs. */
export const retryAvatarDeletions = onSchedule({schedule: 'every 5 minutes', timeoutSeconds: 120, maxInstances: 1}, async () => { await drainAvatarDeletions(); });
