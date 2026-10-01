import { onCall } from 'firebase-functions/v2/https';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { bucket, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, logEvent, requireCaller } from './core';
import { reasonError } from './errors';
import { bumpWindow } from './limits';
import { judgeSafeSearch, level, LEVELS, type SafeSearch } from './avatarPolicy';

/**
 * Profile photos are user-generated images, so every upload is screened before anyone sees it.
 * The app uploads to avatars/{luid}/pending/{id}.jpg (Storage rules allow nothing else); this
 * trigger runs Cloud Vision SafeSearch and either rejects the photo or publishes it to
 * avatars/{luid}/current/ and points profiles.avatar_url at it. Accepted photos still land in the
 * admin avatar queue for human review. Any error rejects the photo (fail closed).
 */

const PENDING_PATH = /^avatars\/([0-9a-f-]{36})\/pending\/([0-9a-f-]{36})\.jpg$/;
const AVATAR_UPLOADS_PER_HOUR = 5;
let vision: ImageAnnotatorClient | null = null;

/**
 * Screening runs from this callable (the app calls it right after uploading) instead of a Storage
 * trigger: triggers need Eventarc/Pub-Sub IAM grants that org policies can block. The path is built
 * from the caller's own luid, so nobody can screen or publish someone else's upload.
 */
export const screenAvatar = onCall({ memory: '512MiB', timeoutSeconds: 60, enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const { luid } = requireCaller(request);
  const id = String((request.data as { objectId?: unknown } | undefined)?.objectId ?? '').toLowerCase();
  const path = `avatars/${luid}/pending/${id}.jpg`;
  if (!PENDING_PATH.test(path)) throw reasonError('invalid-argument', 'Invalid avatar', 'invalid_avatar');
  const [exists] = await bucket().file(path).exists();
  if (!exists) throw reasonError('not-found', 'Avatar upload not found', 'avatar_not_found');
  const status = await screenAvatarObject(luid, id, path);
  return { status };
});

async function screenAvatarObject(luid: string, id: string, path: string): Promise<'accepted' | 'rejected' | 'rate_limited' | 'superseded'> {
  const bucketName = bucket().name;
  const pending = bucket().file(path);
  const reviewRef = db.collection('avatar_reviews').doc(luid);

  // Per-user quota (5 uploads/hour, each one costs a Vision call) and "newest upload wins" marker.
  const admitted = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewRef);
    const { allowed, next } = bumpWindow(snap.data()?.upload_window_state, Date.now(), 3_600_000, AVATAR_UPLOADS_PER_HOUR);
    if (!allowed) return false;
    tx.set(reviewRef, { luid, latest_object: path, upload_window_state: next }, { merge: true });
    return true;
  });
  if (!admitted) {
    await pending.delete({ ignoreNotFound: true });
    await logEvent({ userId: luid, name: 'avatar_rate_limited' });
    return 'rate_limited';
  }

  let verdict: 'accepted' | 'rejected' = 'rejected';
  let annotation: SafeSearch = null;
  try {
    vision ??= new ImageAnnotatorClient();
    const [result] = await vision.safeSearchDetection(`gs://${bucketName}/${path}`);
    annotation = result.safeSearchAnnotation as SafeSearch;
    verdict = judgeSafeSearch(annotation);
  } catch (error) {
    console.error('avatar_screening_failed', luid, error);
  }

  const privateRef = db.collection('users_private').doc(luid);
  if (verdict === 'rejected') {
    await pending.delete({ ignoreNotFound: true });
    await privateRef.set({ avatar_rejected_at: FieldValue.serverTimestamp() }, { merge: true });
    await logEvent({ userId: luid, name: 'avatar_rejected' });
    return 'rejected';
  }

  const profileRef = db.collection('profiles').doc(luid);
  const currentPath = `avatars/${luid}/current/${id}.jpg`;
  await pending.copy(bucket().file(currentPath));
  const published = await db.runTransaction(async (tx) => {
    const [profile, review] = await Promise.all([tx.get(profileRef), tx.get(reviewRef)]);
    if (!profile.exists || profile.data()!.deleted_at) return false;
    // A newer upload arrived while this one was being screened: do not overwrite it.
    if (review.data()?.latest_object !== path) return false;
    tx.update(profileRef, { avatar_url: `storage://${currentPath}`, updated_at: FieldValue.serverTimestamp() });
    tx.set(reviewRef, {
      luid,
      path: currentPath,
      status: 'pending',
      safe_search: Object.fromEntries(
        Object.entries(annotation ?? {}).filter(([key]) => ['adult', 'racy', 'violence', 'medical'].includes(key)).map(([k, v]) => [k, LEVELS[level(v)]]),
      ),
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  await pending.delete({ ignoreNotFound: true });
  if (!published) {
    await bucket().file(currentPath).delete({ ignoreNotFound: true });
    return 'superseded';
  }
  await privateRef.set({ avatar_rejected_at: null }, { merge: true });

  // Only the newest photo is kept.
  const [older] = await bucket().getFiles({ prefix: `avatars/${luid}/current/` });
  await Promise.all(older.filter((f) => f.name !== currentPath).map((f) => f.delete({ ignoreNotFound: true })));
  await logEvent({ userId: luid, name: 'avatar_accepted' });
  return 'accepted';
}
