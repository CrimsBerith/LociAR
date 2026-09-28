import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { randomUUID } from 'node:crypto';
import { db, FieldValue } from './core';

async function safeUpdate(path: string, data: Record<string, unknown>): Promise<void> {
  try {
    await db.doc(path).update(data);
  } catch (error) {
    // NOT_FOUND: the parent row was deleted (e.g. account deletion cascade). Nothing to count.
    if ((error as { code?: number }).code !== 5) throw error;
  }
}

async function emitActivity(kind: 'like' | 'comment' | 'follow', actorId: string, recipientId: string | null, postId: string | null, body: string) {
  if (!recipientId || actorId === recipientId) return;
  const id = randomUUID();
  await db.collection('activity_events').doc(id).set({
    id,
    kind,
    actor_id: actorId,
    recipient_id: recipientId,
    post_id: postId,
    body,
    read_at: null,
    created_at: FieldValue.serverTimestamp(),
  });
}

async function postCreator(postId: string): Promise<string | null> {
  const snap = await db.collection('posts').doc(postId).get();
  return snap.exists ? String(snap.data()!.creator_id) : null;
}

export const onLikeCreated = onDocumentCreated('likes/{id}', async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await safeUpdate(`posts/${like.post_id}`, { likes_count: FieldValue.increment(1), engagement_score: FieldValue.increment(3) });
  await emitActivity('like', like.user_id, await postCreator(like.post_id), like.post_id, 'Postunu beğendi.');
});

export const onLikeDeleted = onDocumentDeleted('likes/{id}', async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await safeUpdate(`posts/${like.post_id}`, { likes_count: FieldValue.increment(-1), engagement_score: FieldValue.increment(-3) });
});

export const onCommentCreated = onDocumentCreated('comments/{id}', async (event) => {
  const snap = event.data;
  const comment = snap?.data();
  if (!snap || !comment) return;
  const profile = await db.collection('profiles').doc(comment.user_id).get();
  const handle = profile.exists ? String(profile.data()!.handle) : 'loci';
  if (comment.username !== handle) await snap.ref.update({ username: handle });
  await safeUpdate(`posts/${comment.post_id}`, { comments_count: FieldValue.increment(1), engagement_score: FieldValue.increment(5) });
  await emitActivity('comment', comment.user_id, await postCreator(comment.post_id), comment.post_id, 'Postuna yorum yaptı.');
});

export const onCommentDeleted = onDocumentDeleted('comments/{id}', async (event) => {
  const comment = event.data?.data();
  if (!comment) return;
  await safeUpdate(`posts/${comment.post_id}`, { comments_count: FieldValue.increment(-1), engagement_score: FieldValue.increment(-5) });
});

export const onSaveCreated = onDocumentCreated('post_saves/{id}', async (event) => {
  const save = event.data?.data();
  if (save) await safeUpdate(`posts/${save.post_id}`, { saves_count: FieldValue.increment(1) });
});

export const onSaveDeleted = onDocumentDeleted('post_saves/{id}', async (event) => {
  const save = event.data?.data();
  if (save) await safeUpdate(`posts/${save.post_id}`, { saves_count: FieldValue.increment(-1) });
});

export const onFollowCreated = onDocumentCreated('follows/{id}', async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await Promise.all([
    safeUpdate(`profiles/${follow.follower_id}`, { following_count: FieldValue.increment(1) }),
    safeUpdate(`profiles/${follow.following_id}`, { follower_count: FieldValue.increment(1) }),
  ]);
  await emitActivity('follow', follow.follower_id, follow.following_id, null, 'Seni takip etmeye başladı.');
});

export const onFollowDeleted = onDocumentDeleted('follows/{id}', async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await Promise.all([
    safeUpdate(`profiles/${follow.follower_id}`, { following_count: FieldValue.increment(-1) }),
    safeUpdate(`profiles/${follow.following_id}`, { follower_count: FieldValue.increment(-1) }),
  ]);
});

function isPublicActive(post: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(post && post.status === 'active' && post.visibility === 'public' && post.age_rating !== '18_plus' && !post.deleted_at);
}

export const onPostWritten = onDocumentWritten('posts/{postId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const delta = Number(isPublicActive(after)) - Number(isPublicActive(before));
  const creator = (after ?? before)?.creator_id;
  if (delta !== 0 && creator) await safeUpdate(`profiles/${creator}`, { public_post_count: FieldValue.increment(delta) });
});

/** Keeps denormalised handles on posts and comments in sync with profile renames. */
export const onProfileUpdated = onDocumentUpdated('profiles/{luid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.handle === after.handle) return;
  const luid = event.params.luid;
  const writer = db.bulkWriter();
  const posts = await db.collection('posts').where('creator_id', '==', luid).get();
  posts.docs.forEach((d) => writer.update(d.ref, { creator_handle: after.handle }));
  const comments = await db.collection('comments').where('user_id', '==', luid).get();
  comments.docs.forEach((d) => writer.update(d.ref, { username: after.handle }));
  await writer.close();
});
