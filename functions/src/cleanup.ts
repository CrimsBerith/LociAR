import { onSchedule } from 'firebase-functions/v2/scheduler';
import { bucket, db, deleteStoragePrefix, FieldValue, Timestamp } from './core';
import { deleteCloudAnchor, listCloudAnchors } from './arcoreManagement';
import { selectOrphanAnchors } from './arcoreToken';

/**
 * Storage housekeeping so media does not accumulate for content nobody can see.
 *
 * 1. Removed posts: when a post becomes `removed` (author delete or moderator soft delete),
 *    onPostWritten queues its media in `media_purge_queue` with a 30-day grace period, so an
 *    accidental moderator removal can still be restored with its AR map. Restoring cancels it.
 * 2. Orphan uploads: world maps uploaded for a draft whose createPost never succeeded (app
 *    killed, offline forever, server rejection the client could not clean up) are deleted after
 *    48 hours if no post document exists for them.
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
      if (post.exists) await deleteCloudAnchor(post.data()!.cloud_anchor_id);
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

/** Deletes hosted Cloud Anchors that no post references after 7 days (e.g. post never published). */
export async function purgeOrphanCloudAnchors(now = Date.now(), maxPages = 5): Promise<number> {
  let removed = 0;
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const { anchors, nextPageToken } = await listCloudAnchors(pageToken);
    if (anchors.length === 0) break;
    const referenced = new Set<string>();
    const lookups = await Promise.all(anchors.map((a) => db.collection('posts').where('cloud_anchor_id', '==', a.id).limit(1).get()));
    lookups.forEach((snap, i) => { if (!snap.empty) referenced.add(anchors[i].id); });
    for (const id of selectOrphanAnchors(anchors, referenced, now, 7 * DAY_MS)) {
      if (await deleteCloudAnchor(id)) removed++;
    }
    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }
  return removed;
}

export const cleanupPostMedia = onSchedule({ schedule: 'every day 03:17', timeZone: 'Europe/Istanbul', timeoutSeconds: 540 }, async () => {
  const removed = await purgeDueRemovedMedia();
  const orphans = await purgeOrphanUploads();
  let orphanAnchors = 0;
  try {
    orphanAnchors = await purgeOrphanCloudAnchors();
  } catch (error) {
    console.error('cloud_anchor_cleanup_failed', error);
  }
  console.log(JSON.stringify({ event: 'cleanup_post_media', removed, orphans, orphanAnchors }));
});
