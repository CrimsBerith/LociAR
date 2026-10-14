import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue, isUUID, Timestamp } from './core';
import { isPublicActive } from './counters';
import { accountDeletionRef } from './profileGuard';
import { isPostReport } from './postReports';

/**
 * User location notes publish without manual review (text filter, protected zones and rate
 * limits still apply). Likes make them notification-worthy; reports take them down.
 */
export const DEFAULT_LIKE_THRESHOLD = 3;
export const DEFAULT_REPORT_THRESHOLD = 3;
/** Likes from accounts younger than this do not count toward notifications. */
export const MIN_LIKER_AGE_MS = 24 * 3_600_000;

async function thresholds(tx: FirebaseFirestore.Transaction) {
  const s = await tx.get(db.collection('system').doc('place_notes'));
  const like = s.get('push_like_threshold'), report = s.get('report_hide_threshold');
  return {
    like: Number.isInteger(like) && like >= 1 ? like : DEFAULT_LIKE_THRESHOLD,
    report: Number.isInteger(report) && report >= 1 ? report : DEFAULT_REPORT_THRESHOLD,
  };
}

/** Approves a location note for notifications once enough established accounts like it. */
export async function autoApproveNote(postId: string, now = Date.now()) {
  return db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId), post = await tx.get(ref), data = post.data();
    if (!data || data.note_kind !== 'location' || !isPublicActive(data) || (data.push_state ?? 'none') !== 'none') return false;
    const { like } = await thresholds(tx);
    if (Number(data.likes_count ?? 0) < like) return false;
    const base = db.collection('likes').where('post_id', '==', postId).orderBy('__name__');
    const counted = new Set<string>();
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (counted.size < like) {
      const page = await tx.get((cursor ? base.startAfter(cursor) : base).limit(200));
      const likers = [...new Set(page.docs.map(d => String(d.get('user_id')))
        .filter(id => id && id !== data.creator_id && !counted.has(id)))];
      const records = likers.length ? await tx.getAll(...likers.flatMap(id => [db.collection('profiles').doc(id), accountDeletionRef(id)])) : [];
      for (const [i, id] of likers.entries()) {
        const profile = records[i * 2], created = profile.get('created_at');
        if (profile.exists && !profile.get('suspended') && !profile.get('deleted_at') && !records[i * 2 + 1].exists
          && created instanceof Timestamp && now - created.toMillis() >= MIN_LIKER_AGE_MS) counted.add(id);
      }
      if (page.size < 200) break;
      cursor = page.docs.at(-1);
    }
    if (counted.size < like) return false;
    tx.update(ref, { push_state: 'approved', push_approved_by: 'system:likes', push_approved_at: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Hides a public post once distinct users file enough open reports; moderators can restore it. */
export async function autoHideReported(postId: string) {
  return db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId), post = await tx.get(ref), data = post.data();
    if (!data || data.status !== 'active') return false;
    const { report } = await thresholds(tx);
    const base = db.collection('moderation_flags').where('post_id', '==', postId).where('status', '==', 'open').orderBy('__name__');
    const reporters = new Set<string>();
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (reporters.size < report) {
      const page = await tx.get((cursor ? base.startAfter(cursor) : base).limit(200));
      for (const flag of page.docs) {
        const reporter = flag.get('user_id');
        if (!isUUID(reporter) || reporter === data.creator_id || !isPostReport(flag.data())) continue;
        reporters.add(reporter);
        if (reporters.size >= report) break;
      }
      if (page.size < 200) break;
      cursor = page.docs.at(-1);
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
