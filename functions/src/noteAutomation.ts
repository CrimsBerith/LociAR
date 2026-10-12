import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue, Timestamp } from './core';
import { isPublicActive } from './counters';

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
    const likes = await tx.get(db.collection('likes').where('post_id', '==', postId).limit(200));
    const likers = [...new Set(likes.docs.map(d => String(d.get('user_id'))).filter(id => id && id !== data.creator_id))];
    if (likers.length < like) return false;
    const profiles = await tx.getAll(...likers.map(id => db.collection('profiles').doc(id)));
    const established = profiles.filter(p => {
      const created = p.get('created_at');
      return p.exists && !p.get('suspended') && !p.get('deleted_at') && created instanceof Timestamp && now - created.toMillis() >= MIN_LIKER_AGE_MS;
    });
    if (established.length < like) return false;
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
    const flags = await tx.get(db.collection('moderation_flags').where('post_id', '==', postId).where('status', '==', 'open').limit(100));
    const reporters = new Set(flags.docs.map(d => d.get('user_id')).filter(id => typeof id === 'string' && id !== data.creator_id));
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
