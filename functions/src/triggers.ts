import { forEachSequential } from './async';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { analyticsEventDoc, db, FieldValue, Timestamp } from './core';
import { applyCountersOnce, isPublicActive } from './counters';
import { isAccountDeleting } from './profileGuard';
import { anyBlocked, containsBlockedTerm } from './moderation';
import { schedulePurgeOnStatusChange } from './cleanup';
import { getMessaging } from 'firebase-admin/messaging';
import { deliverPostApprovedPush } from './push';
import { autoApproveNote, indexNotificationLike } from './noteAutomation';

/**
 * `stableId` makes repeat actions (unlike → like, follow → unfollow → follow) and trigger
 * redeliveries retain one activity instead of stacking new ones. `read_at` is kept.
 */
async function emitActivity(kind: 'like' | 'comment' | 'follow', actorId: string, recipientId: string | null, postId: string | null, body: string, stableId?: string) {
  if (!recipientId || actorId === recipientId) return;
  // Comment ids stay on the comment document. Like and follow stable ids are dedup
  // material only: the client receives act_ + UUID, never a hash of public luids.
  const commentId = stableId?.startsWith('comment_') ? stableId : undefined;
  const dedupMaterial = commentId ? undefined : stableId;
  const publicId = commentId ?? `act_${randomUUID()}`;
  const ref = db.collection('activity_events').doc(publicId);
  const keyRef = dedupMaterial
    ? db.collection('activity_keys').doc(createHash('sha256').update(dedupMaterial).digest('hex'))
    : null;
  await db.runTransaction(async tx => {
    const [activity, actorDeleting, recipientDeleting, key] = await Promise.all([
      tx.get(ref),
      isAccountDeleting(tx, actorId),
      isAccountDeleting(tx, recipientId),
      keyRef ? tx.get(keyRef) : Promise.resolve(null),
    ]);
    if (activity.exists || actorDeleting || recipientDeleting || key?.exists) return;
    tx.create(ref, {
      id: publicId,
      kind,
      actor_id: actorId,
      anonymous: kind === 'like',
      recipient_id: recipientId,
      post_id: postId,
      body,
      read_at: null,
      created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + 180 * 86_400_000),
    });
    if (keyRef) tx.create(keyRef, { event_id: publicId, created_at: FieldValue.serverTimestamp() });
  });
}

async function postCreator(postId: string): Promise<string | null> {
  const snap = await db.collection('posts').doc(postId).get();
  const creator = snap.data()?.creator_id;
  return typeof creator === 'string' ? creator : null;
}

export const onLikeCreated = onDocumentCreated({ document: 'likes/{id}', retry: true }, async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await applyCountersOnce(event.id, [{ path: `posts/${like.post_id}`, fields: ['likes_count'] }]);
  const post = await db.collection('posts').doc(like.post_id).get();
  if (post.get('note_kind') === 'location' && (post.get('push_state') ?? 'none') === 'none' && isPublicActive(post.data())) {
    const ref = event.data?.ref ?? db.collection('likes').doc(`${like.post_id}_${like.user_id}`);
    await indexNotificationLike(ref);
    // Run after indexing even if a concurrent recount already wrote the same likes_count.
    await autoApproveNote(like.post_id);
  }
  const activityId = createHash('sha256').update(`like_${like.post_id}_${like.user_id}`).digest('hex');
  await emitActivity('like', like.user_id, typeof post.get('creator_id') === 'string' ? post.get('creator_id') : null, like.post_id, 'Postunu beğendi.', activityId);
});

export const onLikeDeleted = onDocumentDeleted({ document: 'likes/{id}', retry: true }, async (event) => {
  const like = event.data?.data();
  if (!like) return;
  await applyCountersOnce(event.id, [{ path: `posts/${like.post_id}`, fields: ['likes_count'] }]);
});

export const onCommentCreated = onDocumentCreated({ document: 'comments/{id}', retry: true }, async (event) => {
  const snap = event.data;
  const comment = snap?.data();
  if (!snap || !comment) return;
  if (comment.admin_restored !== true && containsBlockedTerm(String(comment.text ?? ''))) {
    // Fixed ids keep redelivered events from writing a second flag or analytics event.
    const flagRef = db.collection('moderation_flags').doc(`comment_${snap.id}`);
    await db.runTransaction(async (tx) => {
      const [flag, current] = await Promise.all([tx.get(flagRef), tx.get(snap.ref)]);
      // An old filtered delivery must never remove a later moderator restoration.
      if (!current.exists || current.get('admin_restored') === true
        || current.get('text') !== comment.text || current.get('user_id') !== comment.user_id
        || current.get('post_id') !== comment.post_id
        || (snap.createTime && !snap.createTime.isEqual(current.createTime!))
        || await isAccountDeleting(tx, comment.user_id)) return;
      if (!flag.exists) {
        tx.create(flagRef, {
          post_id: comment.post_id ?? null, user_id: null, reason: 'comment_filtered', status: 'open', server_origin: 'comment_filter',
          metadata: { comment_id: snap.id, author_id: comment.user_id, text: String(comment.text).slice(0, 500) },
          created_at: FieldValue.serverTimestamp(),
        });
        tx.create(db.collection('analytics_events').doc(`comment_filtered_${snap.id}`),
          analyticsEventDoc({ userId: comment.user_id, postId: comment.post_id, name: 'comment_filtered' }));
      }
      tx.set(db.collection('moderation_originals').doc(flagRef.id), {
        target: 'comment', id: snap.id, post_id: comment.post_id, user_id: comment.user_id, text: String(comment.text),
        source_created_at: current.createTime, created_at: FieldValue.serverTimestamp(),
        expires_at: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
      });
      // Marker, moderation records and deletion commit together. Delete deliveries recount
      // current source rows, so this uncounted comment cannot decrement an unrelated count.
      tx.set(db.collection('filtered_comments').doc(snap.id), {
        post_id: comment.post_id ?? null, user_id: comment.user_id,
        created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
      });
      tx.delete(snap.ref);
    });
    return;
  }
  // Read the live profile in the same transaction as the comment. A rename that
  // commits after this delivery started must not be overwritten with the old handle.
  await db.runTransaction(async (tx) => {
    if (await isAccountDeleting(tx, comment.user_id)) return;
    const [current, profile] = await Promise.all([
      tx.get(snap.ref),
      tx.get(db.collection('profiles').doc(comment.user_id)),
    ]);
    if (!current.exists) return;
    const handle = profile.exists ? String(profile.get('handle')) : 'loci';
    if (current.get('username') === handle) return;
    tx.update(current.ref, { username: handle });
  });
  await applyCountersOnce(event.id, [{ path: `posts/${comment.post_id}`, fields: ['comments_count'] }]);
  await emitActivity('comment', comment.user_id, await postCreator(comment.post_id), comment.post_id, 'Postuna yorum yaptı.', `comment_${snap.id}`);
});

export const onCommentDeleted = onDocumentDeleted({ document: 'comments/{id}', retry: true }, async (event) => {
  const comment = event.data?.data();
  if (!comment) return;
  const filtered = db.collection('filtered_comments').doc(event.params.id);
  await applyCountersOnce(event.id, [{ path: `posts/${comment.post_id}`, fields: ['comments_count'] }], filtered);
});

export const onSaveCreated = onDocumentCreated({ document: 'post_saves/{id}', retry: true }, async (event) => {
  const save = event.data?.data();
  if (save) await applyCountersOnce(event.id, [{ path: `posts/${save.post_id}`, fields: ['saves_count'] }]);
});

export const onSaveDeleted = onDocumentDeleted({ document: 'post_saves/{id}', retry: true }, async (event) => {
  const save = event.data?.data();
  if (save) await applyCountersOnce(event.id, [{ path: `posts/${save.post_id}`, fields: ['saves_count'] }]);
});

export const onFollowCreated = onDocumentCreated({ document: 'follows/{id}', retry: true }, async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await applyCountersOnce(event.id, [
    { path: `profiles/${follow.follower_id}`, fields: ['following_count'] },
    { path: `profiles/${follow.following_id}`, fields: ['follower_count'] },
  ]);
  await emitActivity('follow', follow.follower_id, follow.following_id, null, 'Seni takip etmeye başladı.', `follow_${follow.follower_id}_${follow.following_id}`);
});

export const onFollowDeleted = onDocumentDeleted({ document: 'follows/{id}', retry: true }, async (event) => {
  const follow = event.data?.data();
  if (!follow) return;
  await applyCountersOnce(event.id, [
    { path: `profiles/${follow.follower_id}`, fields: ['following_count'] },
    { path: `profiles/${follow.following_id}`, fields: ['follower_count'] },
  ]);
});

export const onPostWritten = onDocumentWritten({ document: 'posts/{postId}', retry: true }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Counter-only writes (views, likes, comments, saves) change none of these fields: exit at once.
  if (before && after && before.status === after.status && before.visibility === after.visibility
    && before.age_rating === after.age_rating && Boolean(before.deleted_at) === Boolean(after.deleted_at)
    && before.creator_id === after.creator_id && before.is_anonymous === after.is_anonymous) return;
  // Pending/private posts cannot change the public count. Avoid locking the creator
  // profile for every draft, especially during a large account deletion.
  const publicCreator = (data: FirebaseFirestore.DocumentData | undefined): string | null =>
    isPublicActive(data) && data?.is_anonymous !== true && typeof data?.creator_id === 'string' ? data.creator_id : null;
  const previousCreator = publicCreator(before), nextCreator = publicCreator(after);
  if (previousCreator !== nextCreator) {
    const creators = [...new Set([previousCreator, nextCreator].filter((creator): creator is string => creator !== null))];
    if (creators.length > 0) await applyCountersOnce(event.id, creators.map((creator) => ({ path: `profiles/${creator}`, fields: ['public_post_count'] })));
  }
  if (after) {
    await db.runTransaction(async tx => {
      const current = await tx.get(db.collection('posts').doc(event.params.postId));
      const data = current.data();
      if (!data || typeof data.creator_id !== 'string' || await isAccountDeleting(tx, data.creator_id)) return;
      tx.set(db.collection('storage_reclamations').doc(current.id), { post_id: current.id, creator_id: data.creator_id, state: data.deleted_at ? 'removed' : 'committed',
        world_map_path: data.world_map_path ?? null, is_anonymous: data.is_anonymous === true, public_readable: isPublicActive(data) }, { merge: true });
    });
  }
  if (before?.status !== after?.status) await schedulePurgeOnStatusChange(event.params.postId, before, after);
  // Moderator approval: tell the author once. FCM has no emulator; a push failure never fails the trigger.
  if (before?.status === 'pending_review' && after?.status === 'active' && !after.deleted_at
    && process.env.FUNCTIONS_EMULATOR !== 'true') {
    await deliverPostApprovedPush(event.params.postId, message => getMessaging().send(message))
      .catch(error => console.warn('post_approved_push_failed', { code: (error as { code?: string }).code ?? 'unknown' }));
  }
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
    let changed = 0;
    page.docs.forEach((d) => {
      if (collection === 'posts' && d.get('is_anonymous') === true) return;
      if (d.get(field) !== value) { batch.update(d.ref, { [field]: value }); changed++; }
    });
    if (changed) await batch.commit();
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
export const onProfileUpdated = onDocumentUpdated({ document: 'profiles/{luid}', retry: true }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const counterFields = new Set(['follower_count', 'following_count', 'public_post_count']);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !isDeepStrictEqual(before[key], after[key]));
  // Any additional change, including status/moderation fields, keeps the fresh account path.
  if (changed.length > 0 && changed.every(key => counterFields.has(key)
    && Number.isSafeInteger(before[key]) && Number.isSafeInteger(after[key]))) return;
  const luid = event.params.luid;
  const active = await db.runTransaction(async (tx) => {
    const [profile, access, deleting] = await Promise.all([
      tx.get(db.collection('profiles').doc(luid)), tx.get(db.collection('account_access').doc(luid)), isAccountDeleting(tx, luid),
    ]);
    if (deleting || !profile.exists) return false;
    let state = profile.get('suspended') === true ? 'suspended' : 'active';
    if (profile.get('deleted_at')) state = 'deleting';
    if (access.get('state') !== state) tx.set(access.ref, { state });
    return true;
  });
  if (!active) return;
  await forEachSequential(['bio', 'display_name'] as const, async (field) => {
    if (before[field] !== after[field] && anyBlocked([after[field]]) && after.moderation_approved_text?.[field] !== after[field]) {
      await db.runTransaction(async (tx) => {
        if (await isAccountDeleting(tx, luid)) return;
        const flag = db.collection('moderation_flags').doc('profile_' + createHash('sha256').update(`${event.id}:${luid}:${field}`).digest('hex'));
        const [existingFlag, current] = await tx.getAll(flag, db.collection('profiles').doc(luid));
        if (existingFlag.exists || !current.exists || current.get(field) !== after[field]) return;
        tx.create(flag, {
          post_id: null, user_id: luid, reason: 'profile_text_filtered', status: 'open', server_origin: 'profile_filter',
          metadata: { field, text: String(after[field]).slice(0, 300) }, created_at: FieldValue.serverTimestamp(),
        });
        tx.create(db.collection('moderation_originals').doc(flag.id), {
          target: 'profile', user_id: luid, field, text: String(after[field]), replacement: null,
          created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
        });
        tx.update(current.ref, { [field]: null, updated_at: FieldValue.serverTimestamp() });
      });
    }
  });
  if (before.handle === after.handle) return;
  const currentProfile = await db.collection('profiles').doc(luid).get();
  if (!currentProfile.exists || currentProfile.get('deleted_at')) return;
  await fanOut('posts', 'creator_id', luid, 'creator_handle', currentProfile.get('handle'));
  await fanOut('comments', 'user_id', luid, 'username', currentProfile.get('handle'));
});
