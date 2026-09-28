import { onCall } from 'firebase-functions/v2/https';
import { auth, db, deleteStoragePrefix, FieldValue, logEvent, requireCaller } from './core';

async function deleteQuery(query: FirebaseFirestore.Query, writer: FirebaseFirestore.BulkWriter): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return total;
    snap.docs.forEach((d) => writer.delete(d.ref));
    await writer.flush();
    total += snap.size;
    if (snap.size < 400) return total;
  }
}

/**
 * Permanently deletes the caller's account (App Store Guideline 5.1.1(v)):
 * posts + their media, social rows, collections, activity, profile, private record and the
 * Firebase Auth user. Reports filed by the user are kept for safety but de-identified.
 * Apple token revocation happens on-device (Auth.revokeToken) before this is called.
 */
export const deleteAccount = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  const caller = requireCaller(request);
  const luid = caller.luid;
  await logEvent({ userId: luid, name: 'account_deletion_requested' });

  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 5);

  const posts = await db.collection('posts').where('creator_id', '==', luid).get();
  for (const post of posts.docs) {
    for (const collection of ['likes', 'comments', 'post_saves', 'collection_items']) {
      await deleteQuery(db.collection(collection).where('post_id', '==', post.id), writer);
    }
    writer.delete(post.ref);
  }
  await writer.flush();

  const byField: Array<[string, string]> = [
    ['likes', 'user_id'],
    ['comments', 'user_id'],
    ['post_saves', 'user_id'],
    ['follows', 'follower_id'],
    ['follows', 'following_id'],
    ['user_blocks', 'blocker_id'],
    ['user_blocks', 'blocked_id'],
    ['collection_items', 'owner_id'],
    ['collections', 'owner_id'],
    ['activity_events', 'recipient_id'],
    ['activity_events', 'actor_id'],
    ['post_view_receipts', 'user_id'],
    ['analytics_events', 'user_id'],
  ];
  for (const [collection, field] of byField) {
    await deleteQuery(db.collection(collection).where(field, '==', luid), writer);
  }

  const reports = await db.collection('moderation_flags').where('user_id', '==', luid).get();
  reports.docs.forEach((d) => writer.update(d.ref, { user_id: null, reporter_deleted: true }));
  writer.delete(db.collection('profiles').doc(luid));
  writer.delete(db.collection('users_private').doc(luid));
  await writer.close();

  const removedObjects = await deleteStoragePrefix(`${luid}/`);
  await db.collection('account_deletions').add({
    luid,
    posts_removed: posts.size,
    storage_objects_removed: removedObjects,
    apple_user: caller.isAppleUser,
    created_at: FieldValue.serverTimestamp(),
  });
  await auth.deleteUser(caller.uid);
  return { ok: true };
});
