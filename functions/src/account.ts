import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { appleConfigFromEnv, revokeAppleAuthorization } from './apple';
import { reasonError } from './errors';
import { isRecentAuth } from './limits';
import { deleteAnchorOfPost } from './anchors';
import { deleteAnchorOrQueue } from './anchorQueue';
import { auth, db, CALLABLE_MAX_INSTANCES, deleteStoragePrefix, ENFORCE_APP_CHECK, FieldValue, logEvent, requireCaller } from './core';

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
 *
 * Requires a sign-in from the last 5 minutes (`reauth_required` otherwise). Apple accounts must
 * send a fresh Sign in with Apple `appleAuthorizationCode`; the server revokes the grant with
 * Apple before anything is deleted. Missing configuration (`apple_revoke_unavailable`), a missing
 * code or any Apple error (`apple_revoke_failed`) aborts with nothing deleted.
 */
/** .p8 contents; Secret Manager. TEAM_ID/KEY_ID/CLIENT_ID come from functions/.env.<project> (see .env.example). */
const APPLE_PRIVATE_KEY = defineSecret('APPLE_PRIVATE_KEY');

export const deleteAccount = onCall({ timeoutSeconds: 300, memory: '512MiB', enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, secrets: [APPLE_PRIVATE_KEY] }, async (request) => {
  const caller = requireCaller(request);
  const luid = caller.luid;
  if (!isRecentAuth(request.auth?.token?.auth_time, Date.now())) {
    throw reasonError('failed-precondition', 'Recent sign-in required', 'reauth_required');
  }
  if (caller.isAppleUser) {
    const code = (request.data as { appleAuthorizationCode?: unknown } | null)?.appleAuthorizationCode;
    const config = appleConfigFromEnv();
    if (!config) {
      console.error('apple_revoke_unavailable', 'APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID or APPLE_PRIVATE_KEY is not set');
      throw reasonError('failed-precondition', 'Apple token revocation is not configured', 'apple_revoke_unavailable');
    }
    if (typeof code !== 'string' || !code) {
      throw reasonError('failed-precondition', 'Apple token revocation is required', 'apple_revoke_failed');
    }
    try {
      await revokeAppleAuthorization(config, code);
    } catch (error) {
      console.error('apple_revoke_failed', (error as Error).message);
      throw reasonError('failed-precondition', 'Apple token revocation failed', 'apple_revoke_failed');
    }
  }
  await logEvent({ userId: luid, name: 'account_deletion_requested' });

  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 5);

  // Posts are processed in pages of 300 so a large account never times out on one huge query.
  let postsRemoved = 0;
  for (;;) {
    const page = await db.collection('posts').where('creator_id', '==', luid).limit(300).get();
    if (page.empty) break;
    for (let i = 0; i < page.docs.length; i += 10) {
      await Promise.all(page.docs.slice(i, i + 10).map((p) => deleteAnchorOfPost(p.data().cloud_anchor_id, p.id)));
    }
    for (const post of page.docs) {
      for (const collection of ['likes', 'comments', 'post_saves', 'collection_items']) {
        await deleteQuery(db.collection(collection).where('post_id', '==', post.id), writer);
      }
      writer.delete(post.ref);
    }
    await writer.flush();
    postsRemoved += page.size;
  }

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
    ['post_quota', 'owner_luid'],
    ['anchor_quota', 'owner_luid'],
    ['invites', 'creator_id'],
    ['invites', 'redeemed_by'],
    ['invite_attempts', 'owner_luid'],
    ['push_tokens', 'owner_luid'],
    ['push_quota', 'owner_luid'],
  ];
  for (const [collection, field] of byField) {
    await deleteQuery(db.collection(collection).where(field, '==', luid), writer);
  }

  await deleteQuery(db.collection('handles').where('luid', '==', luid), writer);
  await deleteQuery(db.collection('avatar_reviews').where('luid', '==', luid), writer);
  await deleteQuery(db.collection('avatar_uploads').where('luid', '==', luid), writer);

  // Hosted anchors that never got bound to a post (publish abandoned) still belong to the user.
  const unbound = await db.collection('cloud_anchors').where('owner_luid', '==', luid).get();
  for (const record of unbound.docs) {
    await deleteAnchorOrQueue(record.id);
    writer.delete(record.ref);
  }

  const reports = await db.collection('moderation_flags').where('user_id', '==', luid).get();
  reports.docs.forEach((d) => {
    // Profile-text flags are about the user (their bio/name), not filed by them: drop the text too.
    if (d.get('reason') === 'profile_text_filtered') {
      writer.update(d.ref, { user_id: null, 'metadata.text': null, author_deleted: true });
    } else {
      writer.update(d.ref, { user_id: null, reporter_deleted: true });
    }
  });
  // Filtered-comment flags keep the text for moderators, but not who wrote it.
  const authored = await db.collection('moderation_flags').where('metadata.author_id', '==', luid).get();
  authored.docs.forEach((d) => writer.update(d.ref, { 'metadata.author_id': null, 'metadata.text': null, author_deleted: true }));
  writer.delete(db.collection('profiles').doc(luid));
  writer.delete(db.collection('users_private').doc(luid));
  await writer.close();

  const removedObjects = await deleteStoragePrefix(`${luid}/`);
  await db.collection('account_deletions').add({
    luid,
    posts_removed: postsRemoved,
    storage_objects_removed: removedObjects,
    apple_user: caller.isAppleUser,
    created_at: FieldValue.serverTimestamp(),
  });
  await auth.deleteUser(caller.uid);
  return { ok: true };
});
