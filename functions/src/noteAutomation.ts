import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue, isUUID, Timestamp } from './core';
import { isPublicActive } from './counters';
import { accountDeletionRef } from './profileGuard';
import { isPostReport } from './postReports';
import { readPages } from './async';

/**
 * User location notes publish without manual review (text filter, protected zones and rate
 * limits still apply). Likes make them notification-worthy; reports take them down.
 */
export const DEFAULT_LIKE_THRESHOLD = 3;
export const DEFAULT_REPORT_THRESHOLD = 3;
/** Likes from accounts younger than this do not count toward notifications. */
export const MIN_LIKER_AGE_MS = 24 * 3_600_000;
export const MIN_REPORTER_AGE_MS = MIN_LIKER_AGE_MS;
/**
 * Brigading guard: only verified Apple/email accounts (users_private.identity_verified) count as
 * reporters, and a popular or long-standing post needs twice the reports before it is hidden
 * automatically. Every report still reaches the moderation queue.
 */
export const POPULAR_POST_LIKES = 10;
export const ESTABLISHED_POST_AGE_MS = 30 * 86_400_000;
export function reportsNeeded(threshold: number, post: FirebaseFirestore.DocumentData, now = Date.now()): number {
  const created = post.created_at instanceof Timestamp ? post.created_at.toMillis() : now;
  const established = Number(post.likes_count ?? 0) >= POPULAR_POST_LIKES || now - created >= ESTABLISHED_POST_AGE_MS;
  return established ? threshold * 2 : threshold;
}

async function thresholds(tx: FirebaseFirestore.Transaction) {
  const s = await tx.get(db.collection('system').doc('place_notes'));
  const like = s.get('push_like_threshold'), report = s.get('report_hide_threshold');
  return {
    like: Number.isInteger(like) && like >= 1 ? like : DEFAULT_LIKE_THRESHOLD,
    report: Number.isInteger(report) && report >= 1 ? report : DEFAULT_REPORT_THRESHOLD,
  };
}

function establishedProfile(profile: FirebaseFirestore.DocumentSnapshot, deletion: FirebaseFirestore.DocumentSnapshot, now: number, minimumAge: number): boolean {
  const created = profile.get('created_at');
  return profile.exists && !profile.get('suspended') && !profile.get('deleted_at') && !deletion.exists
    && created instanceof Timestamp && now - created.toMillis() >= minimumAge;
}

function reactionPages(tx: FirebaseFirestore.Transaction, base: FirebaseFirestore.Query) {
  return readPages(async (cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined) => {
    const page = await tx.get((cursor ? base.startAfter(cursor) : base).limit(200));
    return { value: page, next: page.size < 200 ? undefined : page.docs.at(-1) };
  });
}

/** Approves a location note for notifications once enough established accounts like it. */
export async function autoApproveNote(postId: string, now = Date.now()) {
  return await db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId), post = await tx.get(ref), data = post.data();
    if (data?.note_kind !== 'location' || !isPublicActive(data) || (data.push_state ?? 'none') !== 'none') return false;
    const { like } = await thresholds(tx);
    if (Number(data.likes_count ?? 0) < like) return false;
    const base = db.collection('likes').where('post_id', '==', postId).orderBy('__name__');
    const counted = new Set<string>();
    for await (const page of reactionPages(tx, base)) {
      const likers = [...new Set(page.docs.map(d => String(d.get('user_id')))
        .filter(id => id && id !== data.creator_id && !counted.has(id)))];
      const records = likers.length ? await tx.getAll(...likers.flatMap(id => [db.collection('profiles').doc(id), accountDeletionRef(id)])) : [];
      for (const [i, id] of likers.entries()) {
        if (establishedProfile(records[i * 2], records[i * 2 + 1], now, MIN_LIKER_AGE_MS)) counted.add(id);
      }
      if (counted.size >= like) break;
    }
    if (counted.size < like) return false;
    tx.update(ref, { push_state: 'approved', push_approved_by: 'system:likes', push_approved_at: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Hides a public post once distinct users file enough open reports; moderators can restore it. */
export async function autoHideReported(postId: string, now = Date.now()) {
  return await db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId), post = await tx.get(ref), data = post.data();
    if (data?.status !== 'active') return false;
    const report = reportsNeeded((await thresholds(tx)).report, data, now);
    const base = db.collection('moderation_flags').where('post_id', '==', postId).where('status', '==', 'open').orderBy('__name__');
    const reporters = new Set<string>();
    const inspected = new Set<string>();
    for await (const page of reactionPages(tx, base)) {
      const candidates = [...new Set(page.docs.filter(flag => isPostReport(flag.data())).map(flag => flag.get('user_id'))
        .filter((id): id is string => isUUID(id) && id !== data.creator_id && !inspected.has(id)))];
      const records = candidates.length ? await tx.getAll(...candidates.flatMap(id => [
        db.collection('profiles').doc(id), accountDeletionRef(id), db.collection('users_private').doc(id)])) : [];
      for (const [index, reporter] of candidates.entries()) {
        inspected.add(reporter);
        if (!establishedProfile(records[index * 3], records[index * 3 + 1], now, MIN_REPORTER_AGE_MS)
          || records[index * 3 + 2].get('identity_verified') !== true) continue;
        reporters.add(reporter);
        if (reporters.size >= report) break;
      }
      if (reporters.size >= report) break;
    }
    if (reporters.size < report) return false;
    tx.update(ref, { status: 'flagged', auto_hidden_at: FieldValue.serverTimestamp(), auto_hidden_reports: reporters.size,
      ...(data.push_state === 'approved' ? { push_state: 'revoked', push_revoked_by: 'system:reports' } : {}), updated_at: FieldValue.serverTimestamp() });
    return true;
  });
}

export const onReportCreated = onDocumentCreated({ document: 'moderation_flags/{flagId}', retry: true, maxInstances: 5 }, async event => {
  const postId = event.data?.get('post_id');
  if (typeof postId === 'string' && /^[0-9a-f-]{36}$/.test(postId)) await autoHideReported(postId);
});
