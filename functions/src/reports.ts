import { createHash } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, isUUID, requireCaller, Timestamp } from './core';
import { assertAccountNotDeleting } from './profileGuard';
import { isPublicActive } from './counters';
import { reasonError } from './errors';
import { bumpWindow } from './limits';

export const REPORT_DAILY_LIMIT = 20;
export const REPORT_MINUTE_LIMIT = 5;
const DAY = 86_400_000;
const REASONS: Record<string, string> = { spam: 'spam', harassment: 'harassment', hate: 'hate', sexual: 'sexual', violence: 'violence', other: 'other',
  'Spam veya yanıltıcı': 'spam', 'Taciz veya zorbalık': 'harassment', 'Nefret söylemi': 'hate',
  'Cinsel içerik': 'sexual', 'Şiddet veya tehlikeli içerik': 'violence', 'Diğer': 'other' };

/** Suspended people retain the safety-report path; deletion and missing profiles remain fenced. */
async function reportAccount(tx: FirebaseFirestore.Transaction, luid: string) {
  await assertAccountNotDeleting(tx, luid);
  const profile = await tx.get(db.collection('profiles').doc(luid));
  if (!profile.exists || profile.get('deleted_at')) throw reasonError('permission-denied', 'Account unavailable', 'profile_missing');
  return profile;
}

export const submitReport = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async request => {
  const caller = requireCaller(request), data = request.data;
  const kind = data?.targetKind, rawId = data?.targetId, reason = typeof data?.reason === 'string' && Object.hasOwn(REASONS, data.reason) ? REASONS[data.reason] : undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['targetKind', 'targetId', 'userId', 'reason'].includes(key))) throw new HttpsError('invalid-argument', 'Invalid report');
  if (!['post', 'comment', 'user'].includes(kind) || !isUUID(rawId) || !reason) throw new HttpsError('invalid-argument', 'Invalid report');
  const id = rawId.toLowerCase();
  const receiptId = createHash('sha256').update(`${caller.luid}:${kind}:${id}`).digest('hex');
  const receiptRef = db.collection('report_receipts').doc(receiptId), quotaRef = db.collection('report_quota').doc(caller.luid);
  return await db.runTransaction(async tx => {
    await reportAccount(tx, caller.luid);
    const [receipt, quota] = await tx.getAll(receiptRef, quotaRef);
    const previousId = receipt.get('flag_id'), reportedAt = receipt.get('reported_at');
    const previous = typeof previousId === 'string' ? await tx.get(db.collection('moderation_flags').doc(previousId)) : null;
    // Retry/duplicate is free, even if moderation removed the target after accepting the report.
    if (previous?.exists && (previous.get('status') === 'open' || reportedAt instanceof Timestamp && Date.now() - reportedAt.toMillis() < DAY)) {
      return { ok: true, flagId: previous.id, alreadyReported: true };
    }
    let postId: string | null = null, targetLuid: string;
    let metadata: Record<string, string> = { source: 'native_ios', target: kind };
    if (kind === 'user') {
      targetLuid = id;
      await reportAccount(tx, targetLuid);
      metadata.reported_user_id = id;
    } else {
      let post;
      if (kind === 'comment') {
        const comment = await tx.get(db.collection('comments').doc(id));
        if (!comment.exists || !isUUID(comment.get('post_id')) || !isUUID(comment.get('user_id'))) throw new HttpsError('permission-denied', 'Target unavailable');
        postId = comment.get('post_id'); targetLuid = comment.get('user_id');
        metadata = { ...metadata, comment_id: id, author_id: targetLuid, text: String(comment.get('text') ?? '').slice(0, 500).replace(/[\uD800-\uDBFF]$/, '') };
        post = await tx.get(db.collection('posts').doc(postId!));
      } else {
        postId = id; post = await tx.get(db.collection('posts').doc(id)); targetLuid = post.get('creator_id');
      }
      if (!isPublicActive(post.data()) || !isUUID(targetLuid)) throw new HttpsError('permission-denied', 'Target unavailable');
      await reportAccount(tx, targetLuid);
    }
    if (targetLuid === caller.luid) throw new HttpsError('invalid-argument', 'Cannot report yourself');
    // Read the clock after awaited target reads; a delayed attempt must not overwrite a newer window.
    const now = Date.now();
    const minute = bumpWindow(quota.get('minute'), now, 60_000, REPORT_MINUTE_LIMIT);
    const day = bumpWindow(quota.get('day'), now, DAY, REPORT_DAILY_LIMIT);
    if (!minute.allowed || !day.allowed) throw reasonError('resource-exhausted', 'Report limit reached; try again later', 'rate_limited');
    const flagId = `report_${receiptId}_${Math.floor(now / DAY)}`;
    tx.create(db.collection('moderation_flags').doc(flagId), { post_id: postId, user_id: caller.luid, reason,
      status: 'open', metadata, server_origin: 'user_report', created_at: FieldValue.serverTimestamp() });
    tx.set(receiptRef, { owner_luid: caller.luid, target_luid: targetLuid, target_kind: kind, target_id: id,
      flag_id: flagId, reported_at: Timestamp.fromMillis(now) });
    tx.set(quotaRef, { owner_luid: caller.luid, minute: minute.next, day: day.next, expires_at: Timestamp.fromMillis(now + 2 * DAY) });
    return { ok: true, flagId, alreadyReported: false };
  });
});
