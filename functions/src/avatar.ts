import { onCall } from 'firebase-functions/v2/https';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { randomUUID } from 'node:crypto';
import { assertServiceEnabled, logger, safeErrorCode, analyticsEventDoc, bucket, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, requireCaller, Timestamp } from './core';
import { isAccountDeleting, requireActiveAccount } from './profileGuard';
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
export const AVATAR_UPLOADS_PER_HOUR = 5;
/** Pending uploads nobody screened (app killed, call failed) are deleted by cleanupPostMedia. */
export const PENDING_AVATAR_GRACE_HOURS = 48;
const uploadSlotRef = (id: string) => db.collection('avatar_uploads').doc(id);
let vision: ImageAnnotatorClient | null = null;

async function requireActiveProfile(luid: string): Promise<void> {
  await db.runTransaction(tx => requireActiveAccount(tx, luid));
}

async function logAvatarEvent(luid: string, name: string): Promise<void> {
  const ref = db.collection('analytics_events').doc();
  await db.runTransaction(async tx => {
    if (await isAccountDeleting(tx, luid)) return;
    tx.create(ref, analyticsEventDoc({ userId: luid, name }));
  });
}

/**
 * Hands out one upload slot (`avatar_uploads/{objectId}`), counted against the hourly quota.
 * Storage rules accept `avatars/{luid}/pending/{objectId}.jpg` only while the caller owns that
 * slot, so the quota counts uploads, not screening calls. screenAvatar consumes the slot.
 */
export const beginAvatarUpload = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const { luid } = requireCaller(request);
  await assertServiceEnabled('avatar_upload');
  await requireActiveProfile(luid);
  const objectId = randomUUID();
  const now = Date.now();
  const reviewRef = db.collection('avatar_reviews').doc(luid);
  const admitted = await db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, luid);
    const snap = await tx.get(reviewRef);
    const { allowed, next } = bumpWindow(snap.data()?.upload_window_state, now, 3_600_000, AVATAR_UPLOADS_PER_HOUR);
    if (!allowed) return false;
    tx.set(reviewRef, { luid, upload_window_state: next, latest_object: `avatars/${luid}/pending/${objectId}.jpg` }, { merge: true });
    // TTL policy on expires_at removes unused slots.
    tx.create(uploadSlotRef(objectId), { luid, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + 3_600_000) });
    return true;
  });
  if (!admitted) {
    await logAvatarEvent(luid, 'avatar_rate_limited');
    throw reasonError('resource-exhausted', 'Avatar upload limit reached', 'rate_limited');
  }
  return { objectId };
});

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
  const completed = await db.collection('avatar_screenings').doc(id).get();
  if (completed.get('luid') === luid && ['accepted', 'rejected', 'superseded'].includes(completed.get('status'))) {
    await requireActiveProfile(luid);
    return { status: completed.get('status') };
  }
  await requireActiveProfile(luid);

  let status: 'accepted' | 'rejected' | 'superseded';
  try { status = await screenAvatarObject(luid, id, path); } catch (error) {
    if ((error as {details?: {reason?: string}}).details?.reason === 'avatar_not_found') {
      await db.runTransaction(async tx => { if (!await isAccountDeleting(tx, luid)) enqueueAvatarDelete(tx, luid, path); });
      await drainAvatarDeletions();
    }
    throw error;
  }
  return { status };
});

async function screenAvatarObject(luid: string, id: string, path: string): Promise<'accepted' | 'rejected' | 'superseded'> {
  const bucketName = bucket().name;
  const pending = bucket().file(path);
  const reviewRef = db.collection('avatar_reviews').doc(luid);

  const receiptRef = db.collection('avatar_screenings').doc(id);
  const leaseOwner = randomUUID();
  const admission = await db.runTransaction(async tx => {
    const profile = await requireActiveAccount(tx, luid);
    const [slot, receipt, review] = await tx.getAll(uploadSlotRef(id), receiptRef, reviewRef);
    if (receipt.exists && receipt.get('luid') !== luid) throw reasonError('permission-denied', 'Invalid avatar owner', 'invalid_avatar');
    if (['accepted', 'rejected', 'superseded'].includes(receipt.get('status'))) return { done: String(receipt.get('status')) };
    if (receipt.get('lease_until')?.toMillis?.() > Date.now()) throw reasonError('unavailable', 'Avatar screening is in progress; retry shortly', 'busy_retry');
    if (!slot.exists && !receipt.exists) throw reasonError('not-found', 'Avatar upload not found', 'avatar_not_found');
    if (slot.exists && slot.get('luid') !== luid) throw reasonError('permission-denied', 'Invalid avatar owner', 'invalid_avatar');
    if (slot.exists) tx.delete(slot.ref);
    tx.set(receiptRef, { luid, status: 'screening', lease_owner: leaseOwner, lease_until: Timestamp.fromMillis(Date.now() + 120_000),
      expires_at: Timestamp.fromMillis(Date.now() + 90 * 86_400_000) }, { merge: true });
    return { done: null, previousAvatar: profile.avatar_url ?? null, previousPreset: profile.avatar_preset ?? null,
      newest: review.get('latest_object') === path };
  });
  if (admission.done) return admission.done as 'accepted' | 'rejected' | 'superseded';
  const finish = async (status: 'accepted' | 'rejected' | 'superseded') => db.runTransaction(async tx => {
    const receipt = await tx.get(receiptRef);
    if (await isAccountDeleting(tx, luid)) return;
    if (receipt.get('lease_owner') !== leaseOwner) throw new Error('avatar_screening_lease_lost');
    tx.update(receiptRef, { status, lease_until: null });
    enqueueAvatarDelete(tx, luid, path);
  });
  if (!admission.newest) { await finish('superseded'); await drainAvatarDeletions(); return 'superseded'; }
  const [exists] = await pending.exists();
  if (!exists) { await finish('rejected'); throw reasonError('not-found', 'Avatar upload not found', 'avatar_not_found'); }

  let verdict: 'accepted' | 'rejected' = 'rejected';
  let annotation: SafeSearch = null;
  try {
    vision ??= new ImageAnnotatorClient();
    const [result] = await vision.safeSearchDetection(`gs://${bucketName}/${path}`);
    annotation = result.safeSearchAnnotation as SafeSearch;
    verdict = judgeSafeSearch(annotation);
  } catch (error) {
    logger.error('avatar_screening_failed', { code: safeErrorCode(error) });
    await db.runTransaction(async tx => { const receipt = await tx.get(receiptRef); if (receipt.get('lease_owner') === leaseOwner) tx.update(receiptRef, {lease_until: null}); });
    throw reasonError('unavailable', 'Avatar screening is temporarily unavailable; retry', 'busy_retry');
  }

  const privateRef = db.collection('users_private').doc(luid);
  if (verdict === 'rejected') {
    await finish('rejected');
    await drainAvatarDeletions();
    await db.runTransaction(async tx => {
      if (await isAccountDeleting(tx, luid)) return;
      tx.set(privateRef, { avatar_rejected_at: FieldValue.serverTimestamp() }, { merge: true });
    });
    await logAvatarEvent(luid, 'avatar_rejected');
    return 'rejected';
  }

  const profileRef = db.collection('profiles').doc(luid);
  const currentPath = `avatars/${luid}/current/${id}.jpg`;
  await pending.copy(bucket().file(currentPath));
  // No permanent bearer token is inherited from the pending upload.
  await bucket().file(currentPath).setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
  const published = await db.runTransaction(async (tx) => {
    if (await isAccountDeleting(tx, luid)) return false;
    const [profile, review, receipt] = await tx.getAll(profileRef, reviewRef, receiptRef);
    if (!profile.exists || profile.data()!.deleted_at) return false;
    // A newer upload arrived while this one was being screened: do not overwrite it.
    if (review.data()?.latest_object !== path || receipt.get('lease_owner') !== leaseOwner
      || (profile.get('avatar_url') ?? null) !== admission.previousAvatar
      || (profile.get('avatar_preset') ?? null) !== admission.previousPreset) return false;
    const oldPath = typeof profile.get('avatar_url') === 'string' && profile.get('avatar_url').startsWith('storage://avatars/') ? profile.get('avatar_url').slice(10) : null;
    if (oldPath && oldPath !== currentPath) enqueueAvatarDelete(tx, luid, oldPath);
    tx.update(receiptRef, { status: 'accepted', lease_until: null });
    enqueueAvatarDelete(tx, luid, path);
    tx.update(profileRef, { avatar_url: `storage://${currentPath}`, updated_at: FieldValue.serverTimestamp() });
    tx.set(privateRef, { avatar_rejected_at: null }, { merge: true });
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
  if (!published) {
    await finish('superseded');
    await db.runTransaction(async tx => { if (!await isAccountDeleting(tx, luid)) enqueueAvatarDelete(tx, luid, currentPath); });
    await drainAvatarDeletions();
    return 'superseded';
  }
  await drainAvatarDeletions();
  await logAvatarEvent(luid, 'avatar_accepted');
  return 'accepted';
}

/** Durable deletion is only for exact, immutable paths previously selected by the server. */
const AVATAR_OBJECT_PATH = /^avatars\/([^/]+)\/(?:current|pending)\/[0-9a-f-]{36}\.jpg$/;
export function enqueueAvatarDelete(tx: FirebaseFirestore.Transaction, luid: string, path: string) {
  if (AVATAR_OBJECT_PATH.exec(path)?.[1] !== luid) throw new Error('invalid_avatar_deletion_path');
  const key = path.split('/').at(-1)!.replace('.jpg', '') + '_' + path.split('/')[2];
  tx.set(db.collection('avatar_deletions').doc(key), { luid, path, next_at: Timestamp.now(), attempts: 0 });
}
export async function drainAvatarDeletions(now = Date.now(), limit = 100): Promise<number> {
  const due = await db.collection('avatar_deletions').where('next_at', '<=', Timestamp.fromMillis(now)).limit(limit).get();
  let removed = 0;
  for (const entry of due.docs) {
    const path = String(entry.get('path'));
    try {
      // A delayed cleanup can never delete the selected photo, including moderator approvals.
      const profile = await db.collection('profiles').doc(String(entry.get('luid'))).get();
      if (profile.get('avatar_url') === `storage://${path}`) { await entry.ref.update({next_at: Timestamp.fromMillis(now + 86_400_000)}); continue; }
      await bucket().file(path).delete({ ignoreNotFound: true });
      await entry.ref.delete(); removed++;
    } catch (error) {
      logger.error('avatar_deletion_deferred', { code: safeErrorCode(error) });
      await entry.ref.update({ attempts: FieldValue.increment(1), next_at: Timestamp.fromMillis(now + 5 * 60_000) });
    }
  }
  return removed;
}

/** Cursor advances through current photos too, so they cannot starve later pending uploads. */
export async function purgeStalePendingAvatars(now = Date.now(), maxPages = 5): Promise<number> {
  const cursorRef = db.collection('system').doc('avatar_cleanup_cursor');
  let pageToken = (await cursorRef.get()).get('page_token') as string | undefined;
  let removed = 0;
  for (let page = 0; page < maxPages; page++) {
    const [files, next] = await bucket().getFiles({ prefix: 'avatars/', maxResults: 500, autoPaginate: false, ...(pageToken ? { pageToken } : {}) });
    for (const file of files) {
      if (!PENDING_PATH.test(file.name)) continue;
      const created = Date.parse(String(file.metadata.timeCreated ?? ''));
      if (!Number.isFinite(created) || created > now - PENDING_AVATAR_GRACE_HOURS * 3_600_000) continue;
      const id = file.name.split('/').at(-1)!.replace('.jpg', '');
      const receipt = await db.collection('avatar_screenings').doc(id).get();
      if (receipt.get('lease_until')?.toMillis?.() > now) continue;
      await file.delete({ ignoreNotFound: true }); removed++;
    }
    pageToken = next?.pageToken;
    await cursorRef.set({ page_token: pageToken ?? null, updated_at: FieldValue.serverTimestamp() });
    if (!pageToken) break;
  }
  return removed;
}
