import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { randomUUID } from 'node:crypto';
import { db, FieldValue, logEvent, Timestamp } from './core';
import { applyCountersOnce } from './counters';
import { anyBlocked, containsBlockedTerm } from './moderation';
import { schedulePurgeOnStatusChange } from './cleanup';

async function safeUpdate(path: string, data: Record<string, unknown>): Promise<void> {
  try {
    await db.doc(path).update(data);
  } catch (error) {
    // NOT_FOUND: the parent row was deleted (e.g. account deletion cascade). Nothing to count.
    if ((error as { code?: number }).code !== 5) throw error;
  }
}

/**
 * `stableId` makes repeat actions (unlike → like, follow → unfollow → follow) and trigger
 * redeliveries overwrite one notification instead of stacking new ones. `read_at` is kept.
 */
async function emitActivity(kind: 'like' | 'comment' | 'follow', actorId: string, recipientId: string | null, postId: string | null, body: string, stableId?: string) {
  if (!recipientId || actorId === recipientId) return;
  const id = stableId ?? randomUUID();
  const ref = db.collection('activity_events').doc(id);
  if (stableId && (await ref.get()).exists) return;
  await ref.set({
    id,
    kind,
    actor_id: actorId,
    recipient_id: recipientId,
    post_id: postId,
    body,
    read_at: null,
    created_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromMillis(Date.now() + 180 * 86_400_000),
  });
}

async function postCreator(postId: string): Promise<string | null> {
  const snap = await db.collection('posts').doc(postId).get();
  return snap.exists ? String(snap.data()!.creator_id) : null;
}

export const onLikeCreated = onDocumentCreated('likes/{id}', async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await applyCountersOnce(event.id, [{ path: `posts/${like.post_id}`, changes: { likes_count: 1, engagement_score: 3 } }]);
  await emitActivity('like', like.user_id, await postCreator(like.post_id), like.post_id, 'Postunu beğendi.', `like_${like.post_id}_${like.user_id}`);
});

export const onLikeDeleted = onDocumentDeleted('likes/{id}', async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await applyCountersOnce(event.id, [{ path: `posts/${like.post_id}`, changes: { likes_count: -1, engagement_score: -3 } }]);
});

export const onCommentCreated = onDocumentCreated('comments/{id}', async (event) => {
  const snap = event.data;
  const comment = snap?.data();
  if (!snap || !comment) return;
  if (containsBlockedTerm(String(comment.text ?? ''))) {
    // Removing the comment fires onCommentDeleted, which would decrement a counter that was never
    // incremented; mark it so that trigger skips the counter.
    await db.collection('moderation_flags').doc(randomUUID()).set({
      post_id: comment.post_id ?? null,
      user_id: null,
      reason: 'comment_filtered',
      status: 'open',
      metadata: { comment_id: snap.id, author_id: comment.user_id, text: String(comment.text).slice(0, 500) },
      created_at: FieldValue.serverTimestamp(),
    });
    await db.collection('filtered_comments').doc(snap.id).set({ created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 90 * 86_400_000) });
    await snap.ref.delete();
    await logEvent({ userId: comment.user_id, postId: comment.post_id, name: 'comment_filtered' });
    return;
  }
  const profile = await db.collection('profiles').doc(comment.user_id).get();
  const handle = profile.exists ? String(profile.data()!.handle) : 'loci';
  // The author may delete the comment right away: a missing document is not an error.
  if (comment.username !== handle) await safeUpdate(snap.ref.path, { username: handle });
  await applyCountersOnce(event.id, [{ path: `posts/${comment.post_id}`, changes: { comments_count: 1, engagement_score: 5 } }]);
  await emitActivity('comment', comment.user_id, await postCreator(comment.post_id), comment.post_id, 'Postuna yorum yaptı.', `comment_${snap.id}`);
});

export const onCommentDeleted = onDocumentDeleted('comments/{id}', async (event) => {
  const comment = event.data?.data();
  if (!comment) return;
  const filtered = db.collection('filtered_comments').doc(event.params.id);
  if ((await filtered.get()).exists) {
    await filtered.delete();
    return;
  }
  await applyCountersOnce(event.id, [{ path: `posts/${comment.post_id}`, changes: { comments_count: -1, engagement_score: -5 } }]);
});

export const onSaveCreated = onDocumentCreated('post_saves/{id}', async (event) => {
  const save = event.data?.data();
  if (save) await applyCountersOnce(event.id, [{ path: `posts/${save.post_id}`, changes: { saves_count: 1 } }]);
});

export const onSaveDeleted = onDocumentDeleted('post_saves/{id}', async (event) => {
  const save = event.data?.data();
  if (save) await applyCountersOnce(event.id, [{ path: `posts/${save.post_id}`, changes: { saves_count: -1 } }]);
});

export const onFollowCreated = onDocumentCreated('follows/{id}', async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await applyCountersOnce(event.id, [
    { path: `profiles/${follow.follower_id}`, changes: { following_count: 1 } },
    { path: `profiles/${follow.following_id}`, changes: { follower_count: 1 } },
  ]);
  await emitActivity('follow', follow.follower_id, follow.following_id, null, 'Seni takip etmeye başladı.', `follow_${follow.follower_id}_${follow.following_id}`);
});

export const onFollowDeleted = onDocumentDeleted('follows/{id}', async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await applyCountersOnce(event.id, [
    { path: `profiles/${follow.follower_id}`, changes: { following_count: -1 } },
    { path: `profiles/${follow.following_id}`, changes: { follower_count: -1 } },
  ]);
});

function isPublicActive(post: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(post && post.status === 'active' && post.visibility === 'public' && post.age_rating !== '18_plus' && !post.deleted_at);
}

export const onPostWritten = onDocumentWritten('posts/{postId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Counter-only writes (views, likes, comments, saves) change none of these fields: exit at once.
  if (before && after && before.status === after.status && before.visibility === after.visibility
    && before.age_rating === after.age_rating && Boolean(before.deleted_at) === Boolean(after.deleted_at)
    && before.creator_id === after.creator_id) return;
  const delta = Number(isPublicActive(after)) - Number(isPublicActive(before));
  const creator = (after ?? before)?.creator_id;
  if (delta !== 0 && creator) await applyCountersOnce(event.id, [{ path: `profiles/${creator}`, changes: { public_post_count: delta } }]);
  if (before?.status !== after?.status) await schedulePurgeOnStatusChange(event.params.postId, before, after);
});

const FANOUT_PAGE = 500;

/** Rewrites one denormalised field on every doc of a query, one page at a time (bounded memory). */
async function fanOut(collection: string, ownerField: string, luid: string, field: string, value: unknown): Promise<number> {
  let total = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(collection).where(ownerField, '==', luid).orderBy('__name__').limit(FANOUT_PAGE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) return total;
    const batch = db.batch();
    page.docs.forEach((d) => { if (d.get(field) !== value) batch.update(d.ref, { [field]: value }); });
    await batch.commit();
    total += page.size;
    last = page.docs[page.size - 1];
    if (page.size < FANOUT_PAGE) return total;
  }
}

/**
 * Keeps denormalised handles on posts and comments in sync with profile renames (paged; the
 * 30-day handle cooldown bounds how often this can run per user). Free-text profile fields
 * are screened here because Security Rules cannot run the blocklist.
 */
export const onProfileUpdated = onDocumentUpdated('profiles/{luid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const luid = event.params.luid;
  for (const field of ['bio', 'display_name'] as const) {
    if (before[field] !== after[field] && anyBlocked([after[field]])) {
      await db.collection('moderation_flags').doc(randomUUID()).set({
        post_id: null,
        user_id: luid,
        reason: 'profile_text_filtered',
        status: 'open',
        metadata: { field, text: String(after[field]).slice(0, 300) },
        created_at: FieldValue.serverTimestamp(),
      });
    }
  }
  if (before.handle === after.handle) return;
  await fanOut('posts', 'creator_id', luid, 'creator_handle', after.handle);
  await fanOut('comments', 'user_id', luid, 'username', after.handle);
});
