import { commentFlagTarget, isCommentFlag, roleRevokeError, type ZoneInput } from './policy';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { adminBucket, adminDb, iso } from './firebase-admin';
import { ValidationError } from './validation';
import { accountDeletionStarted } from './account-lifecycle';

/**
 * Admin operations ported from the Supabase SQL functions (admin_moderate_post,
 * admin_resolve_moderation_flag, admin_set_post_metrics, approval workflow, rate limiter).
 * Each mutation runs in a Firestore transaction and writes one audit record whose document ID is
 * the request's idempotency key, which makes replays no-ops.
 */

export class ConflictError extends ValidationError {
  status = 409;
}

async function targetAccountDeleting(tx: Transaction, luid: unknown): Promise<boolean> {
  return typeof luid === 'string' && (await tx.get(adminDb().collection('account_deletion_jobs').doc(luid))).exists;
}

export async function requireTargetAccountActive(tx: Transaction, luid: unknown): Promise<void> {
  if (await targetAccountDeleting(tx, luid)) throw new ConflictError('account_deleting');
}

export async function requireActorAccountActive(tx: Transaction, uid: string): Promise<void> {
  if (await accountDeletionStarted(uid, tx)) throw new ConflictError('account_deleting');
}

type AuditEntry = {
  requestHash?: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: unknown;
  after?: unknown;
  reason: string;
  permissionKey: string;
  riskLevel: 'read' | 'sensitive' | 'critical';
};

function sanitize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]));
  }
  return value ?? null;
}

/** Keeps audit snapshots small: large JSON blobs are dropped. */
function snapshot(data: DocumentData | undefined): unknown {
  if (!data) return null;
  const { pose_json, edit_data_json, anchor_bundle_json, content_source_json, calibration_json, ...rest } = data;
  void pose_json; void edit_data_json; void anchor_bundle_json; void content_source_json; void calibration_json;
  return sanitize(rest);
}

export function writeAudit(tx: Transaction, idempotencyKey: string, entry: AuditEntry) {
  const ref = adminDb().collection('admin_audit_log').doc(idempotencyKey);
  tx.create(ref, {
    id: idempotencyKey,
    ...(entry.requestHash ? { request_hash: entry.requestHash } : {}),
    actor_id: entry.actorId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    before_state: snapshot(entry.before as DocumentData | undefined),
    after_state: snapshot(entry.after as DocumentData | undefined),
    reason: entry.reason,
    permission_key: entry.permissionKey,
    risk_level: entry.riskLevel,
    created_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromMillis(Date.now() + 180 * 86_400_000),
  });
}

export async function recordAudit(idempotencyKey: string, entry: AuditEntry) {
  await adminDb().runTransaction(async (tx) => {
    await requireActorAccountActive(tx, entry.actorId);
    const existing = await tx.get(adminDb().collection('admin_audit_log').doc(idempotencyKey));
    const hash = mutationHash(entry.actorId, entry.action, entry.resourceId ?? '', entry);
    if (!checkReceipt(existing, hash)) writeAudit(tx, idempotencyKey, { ...entry, requestHash: hash });
  });
}

/** Deterministic child key (e.g. the post audit inside a flag decision). */
export function derivedKey(key: string, suffix: string): string {
  const hex = createHash('sha256').update(`${key}:${suffix}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function postVersion(post: DocumentData): string {
  return JSON.stringify({
    viewsCount: Number(post.views_count ?? 0),
    likesCount: Number(post.likes_count ?? 0),
    commentsCount: Number(post.comments_count ?? 0),
    updatedAt: iso(post.updated_at),
  });
}

const MODERATION_STATUS: Record<string, string> = {
  approve: 'active',
  flag: 'flagged',
  soft_delete: 'removed',
  restore: 'pending_review',
};

function applyModeration(tx: Transaction, postRef: FirebaseFirestore.DocumentReference, before: DocumentData, action: string, actorId: string, reason: string) {
  // deleteOwnPost sets deleted_at without deleted_by and wipes the post's media; the author's
  // deletion is final. Even another soft delete must not relabel it as a moderator deletion,
  // which would make a later restore possible.
  if (before.deleted_at && !before.deleted_by) {
    throw new ConflictError('post_deleted_by_author: posts removed by their author cannot be restored');
  }
  if (action === 'approve') {
    if (before.age_rating === '18_plus' || (before.protected_zone_name && !before.admin_zone_exception?.reason)) {
      throw new ConflictError('post_not_approvable: 18+ or protected-zone content cannot be approved');
    }
  }
  const soft = action === 'soft_delete';
  const update = {
    status: MODERATION_STATUS[action],
    deleted_at: soft ? FieldValue.serverTimestamp() : null,
    deleted_by: soft ? actorId : null,
    deletion_reason: soft ? reason : null,
    updated_at: FieldValue.serverTimestamp(),
  };
  if (typeof before.creator_id === 'string') tx.set(adminDb().collection('storage_reclamations').doc(postRef.id), { creator_id: before.creator_id, state: soft ? 'removed' : 'committed', world_map_path: before.world_map_path ?? null, public_readable: action === 'approve' && before.visibility === 'public' }, { merge: true });
  tx.update(postRef, update);
  return { ...before, ...update, deleted_at: soft ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
}

export async function moderatePost(postId: string, action: string, actorId: string, reason: string, idempotencyKey: string) {
  if (!MODERATION_STATUS[action]) throw new ValidationError('invalid_moderation_action');
  const hash = mutationHash(actorId, 'post_moderate', postId, { action, reason });
  const db = adminDb();
  const postRef = db.collection('posts').doc(postId);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new ValidationError('post_not_found');
    if (checkReceipt(audit, hash)) return sanitize(snap.data());
    await requireTargetAccountActive(tx, snap.get('creator_id'));
    const after = applyModeration(tx, postRef, snap.data()!, action, actorId, reason);
    writeAudit(tx, idempotencyKey, {
      requestHash: hash, actorId, action: `post_${action}`, resourceType: 'post', resourceId: postId,
      before: snap.data(), after, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
    });
    return sanitize(after);
  });
}

export async function resolveModerationFlag(flagId: string, action: string, actorId: string, reason: string, idempotencyKey: string) {
  if (!['dismiss', 'approve', 'flag', 'soft_delete'].includes(action)) throw new ValidationError('invalid_moderation_action');
  const hash = mutationHash(actorId, 'flag_decide', flagId, { action, reason });
  const db = adminDb();
  const flagRef = db.collection('moderation_flags').doc(flagId);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const flagSnap = await tx.get(flagRef);
    if (!flagSnap.exists) throw new ValidationError('moderation_flag_not_found');
    const flag = flagSnap.data()!;
    if (checkReceipt(audit, hash) || flag.status !== 'open') return sanitize(flag);
    await requireTargetAccountActive(tx, flag.user_id ?? flag.metadata?.author_id);

    // Comment flags (filtered or reported comments) act on the comment, never on the post:
    // "approve" keeps the comment, "soft_delete" removes it, "flag"/"dismiss" only close the flag.
    if (isCommentFlag(flag)) {
      const commentId = commentFlagTarget(flag);
      let commentSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      const original = commentId ? await tx.get(db.collection('moderation_originals').doc(flagId)) : null;
      const archived = original?.data();
      const trusted = flag.server_origin === 'comment_filter' && archived?.target === 'comment'
        && archived.id === commentId && archived.post_id === flag.post_id;
      if (action === 'approve' && flag.reason === 'comment_filtered' && !trusted) throw new ConflictError('moderation_original_unavailable');
      const restored = action === 'approve' && trusted ? {
        id: String(archived!.id), post_id: String(archived!.post_id), user_id: String(archived!.user_id), text: String(archived!.text),
      } : null;
      if (commentId && (action === 'soft_delete' || restored)) commentSnap = await tx.get(db.collection('comments').doc(commentId));
      if (restored && !commentSnap?.exists) {
        await requireTargetAccountActive(tx, restored.user_id);
        const [author, post] = await Promise.all([
          tx.get(db.collection('profiles').doc(restored.user_id)), tx.get(db.collection('posts').doc(restored.post_id)),
        ]);
        if (!author.exists || author.get('deleted_at') || author.get('suspended') || !post.exists
          || post.get('status') !== 'active' || post.get('visibility') !== 'public') throw new ConflictError('comment_target_unavailable');
        await requireTargetAccountActive(tx, post.get('creator_id'));
        tx.delete(db.collection('filtered_comments').doc(restored.id));
        tx.create(db.collection('comments').doc(restored.id), {
          ...restored, username: String(author.get('handle') ?? ''), admin_restored: true,
          created_at: FieldValue.serverTimestamp(),
        });
      }
      if (commentSnap?.exists && action === 'soft_delete') {
        await requireTargetAccountActive(tx, commentSnap.get('user_id'));
        tx.delete(commentSnap.ref);
      }
      const commentFlagAfter = {
        ...flag,
        status: action === 'dismiss' ? 'dismissed' : 'reviewed',
        metadata: { ...(flag.metadata ?? {}), adminAction: action, reviewedBy: actorId, reviewedAt: new Date().toISOString() },
      };
      tx.update(flagRef, { status: commentFlagAfter.status, metadata: commentFlagAfter.metadata });
      writeAudit(tx, idempotencyKey, {
        requestHash: hash, actorId, action: `moderation_comment_flag_${action}`, resourceType: 'moderation_flag', resourceId: flagId,
        before: flag, after: commentFlagAfter, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
      });
      return sanitize(commentFlagAfter);
    }
    if (flag.reason === 'profile_text_filtered') {
      const original = await tx.get(db.collection('moderation_originals').doc(flagId));
      const data = original.data();
      if (flag.server_origin !== 'profile_filter' || data?.target !== 'profile' || data.user_id !== flag.user_id
        || !['bio', 'display_name'].includes(String(data.field))) throw new ConflictError('moderation_original_unavailable');
      const profile = await tx.get(db.collection('profiles').doc(String(data.user_id)));
      if (!profile.exists || profile.get('deleted_at')) throw new ConflictError('profile_unavailable');
      const field = String(data.field);
      if (action === 'approve') {
        if (profile.get(field) !== data.replacement) throw new ConflictError('profile_changed_since_filtering');
        tx.update(profile.ref, { [field]: data.text, moderation_approved_text: { ...(profile.get('moderation_approved_text') ?? {}), [field]: data.text }, updated_at: FieldValue.serverTimestamp() });
      }
      // The filter already removed the rejected field; newer edits must be preserved.
      const after = { ...flag, status: action === 'dismiss' ? 'dismissed' : 'reviewed' };
      tx.update(flagRef, { status: after.status, reviewed_by: actorId, reviewed_at: FieldValue.serverTimestamp() });
      writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: `moderation_profile_${action}`, resourceType: 'moderation_flag', resourceId: flagId,
        before: flag, after, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive' });
      return sanitize(after);
    }
    if (action !== 'dismiss' && !flag.post_id) throw new ValidationError('moderation_flag_has_no_post');

    let postSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (action !== 'dismiss') {
      postSnap = await tx.get(db.collection('posts').doc(String(flag.post_id)));
      if (!postSnap.exists) throw new ValidationError('post_not_found');
    }
    if (postSnap) {
      await requireTargetAccountActive(tx, postSnap.get('creator_id'));
      const mapped = action === 'flag' ? 'flag' : action;
      const after = applyModeration(tx, postSnap.ref, postSnap.data()!, mapped, actorId, reason);
      writeAudit(tx, derivedKey(idempotencyKey, 'post'), {
        requestHash: hash, actorId, action: `post_${mapped}`, resourceType: 'post', resourceId: postSnap.id,
        before: postSnap.data(), after, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
      });
    }
    const flagAfter = {
      ...flag,
      status: action === 'dismiss' ? 'dismissed' : 'reviewed',
      metadata: { ...(flag.metadata ?? {}), adminAction: action, reviewedBy: actorId, reviewedAt: new Date().toISOString() },
    };
    tx.update(flagRef, { status: flagAfter.status, metadata: flagAfter.metadata });
    writeAudit(tx, idempotencyKey, {
      requestHash: hash, actorId, action: `moderation_flag_${action}`, resourceType: 'moderation_flag', resourceId: flagId,
      before: flag, after: flagAfter, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
    });
    return sanitize(flagAfter);
  });
}

async function metricUpdate(tx: Transaction, postId: string, values: { views: number; likes: number; comments: number }, actorId: string) {
  const [likes, comments] = await Promise.all(['likes', 'comments'].map((collection) =>
    tx.get(adminDb().collection(collection).where('post_id', '==', postId).count())));
  return {
    // Deliberate edits are offsets from the authoritative source rows at this transaction's
    // snapshot. Later interactions and nightly repairs retain the adjustment.
    metrics_counter_offsets: { likes_count: values.likes - likes.data().count, comments_count: values.comments - comments.data().count },
    views_count: values.views,
    likes_count: values.likes,
    comments_count: values.comments,
    engagement_score: values.views + values.likes * 3 + values.comments * 5,
    metrics_admin_edited_at: FieldValue.serverTimestamp(),
    metrics_admin_edited_by: actorId,
    updated_at: FieldValue.serverTimestamp(),
  };
}

export async function setPostMetrics(
  postId: string,
  values: { views: number; likes: number; comments: number },
  actorId: string,
  reason: string,
  idempotencyKey: string,
  approvalRequestId: string | null,
) {
  const hash = mutationHash(actorId, 'post_metrics_set', postId, { values, reason, approvalRequestId });
  const db = adminDb();
  const postRef = db.collection('posts').doc(postId);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const change = await tx.get(db.collection('admin_metric_changes').doc(idempotencyKey));
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new ValidationError('post_not_found');
    if (checkReceipt(change, hash)) return sanitize(snap.data());
    const before = snap.data()!;
    await requireTargetAccountActive(tx, before.creator_id);
    const delta = Math.abs(values.views - Number(before.views_count ?? 0)) + Math.abs(values.likes - Number(before.likes_count ?? 0)) + Math.abs(values.comments - Number(before.comments_count ?? 0));
    // Large changes are applied only inside decideApproval's independent transaction.
    if (delta >= 10_000 || approvalRequestId) throw new ConflictError('approval_required: submit an independent approval request');
    const update = await metricUpdate(tx, postId, values, actorId);
    tx.update(postRef, update);
    tx.create(db.collection('admin_metric_changes').doc(idempotencyKey), {
      request_hash: hash, post_id: postId,
      actor_id: actorId,
      approval_request_id: approvalRequestId,
      before_values: { views_count: before.views_count ?? 0, likes_count: before.likes_count ?? 0, comments_count: before.comments_count ?? 0 },
      after_values: { views_count: values.views, likes_count: values.likes, comments_count: values.comments },
      reason,
      created_at: FieldValue.serverTimestamp(),
    });
    const after = { ...before, ...update, metrics_admin_edited_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    writeAudit(tx, idempotencyKey, {
      requestHash: hash, actorId, action: 'post_metrics_set', resourceType: 'post', resourceId: postId,
      before, after, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical',
    });
    return sanitize(after);
  });
}

export async function decideApproval(approvalId: string, decision: 'approved' | 'rejected', actorId: string, reason: string, idempotencyKey: string) {
  const hash = mutationHash(actorId, 'approval_decide', approvalId, { decision, reason });
  const db = adminDb();
  const approvalRef = db.collection('admin_approval_requests').doc(approvalId);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const snap = await tx.get(approvalRef);
    if (!snap.exists) throw new ValidationError('approval_not_found');
    const approval = snap.data()!;
    if (checkReceipt(audit, hash) || approval.status !== 'pending') return sanitize(approval);

    const finish = (status: string, decisionReason: string) => {
      const update = { status, decided_by: actorId, decided_at: FieldValue.serverTimestamp(), decision_reason: decisionReason };
      tx.update(approvalRef, update);
      const after = { ...approval, ...update, decided_at: new Date().toISOString() };
      writeAudit(tx, idempotencyKey, {
        requestHash: hash, actorId, action: `approval_${status}`, resourceType: 'admin_approval_request', resourceId: approvalId,
        before: approval, after, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical',
      });
      return sanitize(after);
    };

    if (decision === 'rejected') return finish('invalidated', reason);
    if (approval.requested_by === actorId) throw new ConflictError('self_approval_forbidden');
    if (approval.expires_at instanceof Timestamp && approval.expires_at.toMillis() <= Date.now()) {
      return finish('expired', 'Approval request expired.');
    }
    if (approval.action !== 'post_metrics_set' || approval.resource_type !== 'post' || !approval.resource_id) {
      throw new ValidationError('unsupported_approval_action');
    }
    const postRef = db.collection('posts').doc(String(approval.resource_id));
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) return finish('invalidated', 'Target post no longer exists.');
    if (await targetAccountDeleting(tx, postSnap.get('creator_id'))) return finish('invalidated', 'Target account deletion has started.');
    if (postVersion(postSnap.data()!) !== approval.target_version) return finish('invalidated', 'Target changed before approval.');

    const payload = approval.payload as { viewsCount: number; likesCount: number; commentsCount: number };
    const values = { views: payload.viewsCount, likes: payload.likesCount, comments: payload.commentsCount };
    const update = await metricUpdate(tx, postSnap.id, values, actorId);
    tx.update(postRef, update);
    const changeKey = derivedKey(idempotencyKey, 'metric');
    tx.create(db.collection('admin_metric_changes').doc(changeKey), {
      post_id: postSnap.id,
      actor_id: actorId,
      approval_request_id: approvalId,
      before_values: { views_count: postSnap.data()!.views_count ?? 0, likes_count: postSnap.data()!.likes_count ?? 0, comments_count: postSnap.data()!.comments_count ?? 0 },
      after_values: { views_count: values.views, likes_count: values.likes, comments_count: values.comments },
      reason: String(approval.reason ?? reason),
      created_at: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, derivedKey(idempotencyKey, 'post'), {
      requestHash: hash, actorId, action: 'post_metrics_set', resourceType: 'post', resourceId: postSnap.id,
      before: postSnap.data(), after: { ...postSnap.data(), ...update, metrics_admin_edited_at: new Date().toISOString(), updated_at: new Date().toISOString() }, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical',
    });
    return finish('approved', reason);
  });
}

/** Fixed-window rate limiter (admin_consume_rate_limit). Returns false when the limit is exceeded. */
export async function consumeRateLimit(actorId: string, scope: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = adminDb();
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const ref = db.collection('admin_rate_limits').doc(`${actorId}_${scope}_${bucket}`);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()!.count ?? 0) : 0;
    if (count >= limit) return false;
    tx.set(ref, {
      actor_id: actorId,
      scope,
      count: count + 1,
      bucket_started_at: Timestamp.fromMillis(bucket * windowSeconds * 1000),
      expires_at: Timestamp.fromMillis((bucket + 2) * windowSeconds * 1000),
    }, { merge: true });
    return true;
  });
}

export async function setUserSuspended(luid: string, suspended: boolean, actorId: string, reason: string, idempotencyKey: string) {
  const hash = mutationHash(actorId, 'user_suspend', luid, { suspended, reason });
  const db = adminDb();
  const profileRef = db.collection('profiles').doc(luid);
  return db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const snap = await tx.get(profileRef);
    if (!snap.exists) throw new ValidationError('user_not_found');
    if (checkReceipt(audit, hash)) return sanitize(snap.data());
    await requireTargetAccountActive(tx, luid);
    const update = { suspended, updated_at: FieldValue.serverTimestamp() };
    tx.update(profileRef, update);
    tx.set(db.collection('account_access').doc(luid), { state: suspended ? 'suspended' : 'active' });
    const after = { ...snap.data(), suspended };
    writeAudit(tx, idempotencyKey, {
      requestHash: hash, actorId, action: suspended ? 'user_suspend' : 'user_unsuspend', resourceType: 'user', resourceId: luid,
      before: snap.data(), after, reason, permissionKey: 'users.suspend', riskLevel: 'critical',
    });
    return sanitize(after);
  });
}

/** approve keeps the photo; remove deletes it and clears the profile's avatar. */
export async function decideAvatar(luid: string, action: 'approve' | 'remove', actorId: string, reason: string, idempotencyKey: string, deleteObject = async (path: string) => { await adminBucket().file(path).delete({ignoreNotFound: true}); }) {
  const hash = mutationHash(actorId, 'avatar_decide', luid, { action, reason });
  const db = adminDb();
  const reviewRef = db.collection('avatar_reviews').doc(luid);
  const profileRef = db.collection('profiles').doc(luid);
  const result = await db.runTransaction(async (tx) => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const [review, profile] = await Promise.all([tx.get(reviewRef), tx.get(profileRef)]);
    if (!review.exists) throw new ValidationError('avatar_review_not_found');
    if (checkReceipt(audit, hash)) return { review: sanitize(review.data()), path: null as string | null };
    await requireTargetAccountActive(tx, luid);
    const path = String(review.data()!.path ?? '');
    tx.update(reviewRef, { status: action === 'approve' ? 'approved' : 'removed', decided_by: actorId, decided_at: FieldValue.serverTimestamp() });
    if (action === 'remove' && profile.exists && profile.data()!.avatar_url === `storage://${path}`) {
      tx.update(profileRef, { avatar_url: null, updated_at: FieldValue.serverTimestamp() });
    }
    if (action === 'remove' && /^avatars\/[0-9a-f-]{36}\/current\/[0-9a-f-]{36}\.jpg$/.test(path)) {
      tx.set(db.collection('avatar_deletions').doc(derivedKey(idempotencyKey, 'avatar-delete')), { luid, path, next_at: Timestamp.now(), attempts: 0 });
    }
    writeAudit(tx, idempotencyKey, {
      requestHash: hash, actorId, action: `avatar_${action}`, resourceType: 'user', resourceId: luid,
      before: review.data(), after: { ...review.data(), status: action }, reason, permissionKey: 'users.suspend', riskLevel: 'sensitive',
    });
    return { review: sanitize(review.data()), path: action === 'remove' ? path : null };
  });
  if (result.path) {
    try { await deleteObject(result.path);
      await db.collection('avatar_deletions').doc(derivedKey(idempotencyKey, 'avatar-delete')).delete();
    } catch { /* The scheduled worker owns the durable retry. */ }
  }
  return result.review;
}

/** Bind each new mutation receipt to its actor, target and complete payload. */
export function mutationHash(actorId: string, action: string, target: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify([actorId, action, target, payload])).digest('hex');
}
export function checkReceipt(audit: FirebaseFirestore.DocumentSnapshot, hash: string): boolean {
  if (!audit.exists) return false;
  if (audit.get('request_hash') !== hash) throw new ConflictError('idempotency_key_reused');
  return true;
}

/** New zones are distinct records; retries of one operation reuse its deterministic ID. */
export async function createProtectedZone(zone: ZoneInput, actorId: string, reason: string, idempotencyKey: string) {
  const db = adminDb();
  const ref = db.collection('protected_zones').doc(derivedKey(idempotencyKey, 'zone'));
  const hash = mutationHash(actorId, 'zone_create', ref.id, { zone, reason });
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    if (checkReceipt(audit, hash)) return { id: ref.id };
    const after = { ...zone, policy: 'hard_block', active: true };
    tx.create(ref, { ...after, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: 'zone_create', resourceType: 'protected_zone', resourceId: ref.id,
      after, reason, permissionKey: 'zones.write', riskLevel: 'sensitive' });
    return { id: ref.id };
  });
}

export async function setProtectedZoneActive(zoneId: string, active: boolean, actorId: string, reason: string, idempotencyKey: string) {
  const db = adminDb();
  const ref = db.collection('protected_zones').doc(zoneId);
  const hash = mutationHash(actorId, 'zone_active', zoneId, { active, reason });
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const [audit, snap] = await Promise.all([tx.get(db.collection('admin_audit_log').doc(idempotencyKey)), tx.get(ref)]);
    if (checkReceipt(audit, hash)) return audit.get('after_state');
    if (!snap.exists) throw new ValidationError('zone_not_found');
    const after = { ...snap.data(), active };
    tx.update(ref, { active, updated_at: FieldValue.serverTimestamp() });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: active ? 'zone_enable' : 'zone_disable', resourceType: 'protected_zone',
      resourceId: zoneId, before: snap.data(), after, reason, permissionKey: 'zones.write', riskLevel: 'sensitive' });
    return sanitize(after);
  });
}

/** Stop content/cost admission and record the reason in the same transaction. */
export async function setServicePaused(enabled: boolean, actorId: string, reason: string, idempotencyKey: string) {
  const db = adminDb();
  const ref = db.collection('system').doc('flags');
  const hash = mutationHash(actorId, 'service_paused', 'flags', { enabled, reason });
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const [audit, before] = await Promise.all([tx.get(db.collection('admin_audit_log').doc(idempotencyKey)), tx.get(ref)]);
    if (checkReceipt(audit, hash)) return audit.get('after_state');
    const after = { kill_switch: enabled, kill_reason: enabled ? reason : null };
    tx.set(ref, { ...after, updated_by: actorId, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: enabled ? 'kill_switch_on' : 'kill_switch_off', resourceType: 'system_flags',
      resourceId: 'flags', before: before.data(), after, reason, permissionKey: 'system.kill_switch', riskLevel: 'critical' });
    return after;
  });
}

export async function revokeAdminRole(assignmentId: string, actorId: string, reason: string, idempotencyKey: string) {
  const db = adminDb();
  const ref = db.collection('admin_role_assignments').doc(assignmentId);
  const hash = mutationHash(actorId, 'role_revoke', assignmentId, { reason });
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const [audit, snap] = await Promise.all([tx.get(db.collection('admin_audit_log').doc(idempotencyKey)), tx.get(ref)]);
    if (checkReceipt(audit, hash)) return audit.get('after_state');
    if (!snap.exists) throw new ValidationError('role_assignment_not_found');
    const assignment = snap.data()!;
    if (assignment.revoked_at) return sanitize(assignment);
    const supers = await tx.get(db.collection('admin_role_assignments').where('role_key', '==', 'super_admin').where('revoked_at', '==', null));
    const usable = await Promise.all(supers.docs.map(async role => {
      const uid = role.get('user_id');
      return typeof uid === 'string' && !(await accountDeletionStarted(uid, tx));
    }));
    const blocked = roleRevokeError(String(assignment.role_key), usable.filter(Boolean).length);
    if (blocked) throw new ConflictError(blocked);
    const after = { ...assignment, revoked_by: actorId, revoked_at: new Date().toISOString() };
    tx.update(ref, { revoked_at: FieldValue.serverTimestamp(), revoked_by: actorId });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: 'admin_role_revoke', resourceType: 'admin_role_assignment',
      resourceId: assignmentId, before: assignment, after, reason, permissionKey: 'admin_users.write', riskLevel: 'critical' });
    return sanitize(after);
  });
}

/** Audit access to private user fields without retaining emails, search text or profile IDs. */
export async function recordPersonalDataRead(actorId: string, resource: string, count: number) {
  await recordAudit(randomUUID(), { actorId, action: 'personal_data_read', resourceType: resource, resourceId: null,
    after: { count }, reason: 'Administrator viewed private user data.', permissionKey: 'users.read', riskLevel: 'read' });
}

/** Concurrent sign-ins share one factor-change receipt; state and audit commit together. */
export async function recordMfaEnrollment(uid: string, observedFactors: string[]) {
  const db = adminDb();
  const ref = db.collection('admin_mfa_state').doc(uid);
  const factors = [...new Set(observedFactors)].sort();
  const key = randomUUID();
  await db.runTransaction(async tx => {
    await requireActorAccountActive(tx, uid);
    const state = await tx.get(ref);
    const known: string[] = state.get('factor_ids') ?? [];
    const added = factors.filter(id => !known.includes(id));
    const removed = known.filter(id => !factors.includes(id));
    if (!added.length && !removed.length) return;
    writeAudit(tx, key, { actorId: uid, action: added.length ? 'admin_mfa_enrolled' : 'admin_mfa_removed', resourceType: 'admin_mfa', resourceId: uid,
      before: { factors: known.length }, after: { factors: factors.length, added: added.length, removed: removed.length },
      reason: 'Second-factor enrollment changed.', permissionKey: 'session.mfa', riskLevel: 'sensitive' });
    tx.set(ref, { factor_ids: factors, updated_at: FieldValue.serverTimestamp() });
  });
}

/** The request, target version and audit are one atomic, payload-bound operation. */
export async function requestMetricApproval(postId: string, payload: { viewsCount: number; likesCount: number; commentsCount: number }, actorId: string, reason: string, key: string) {
  const db = adminDb();
  const hash = mutationHash(actorId, 'approval_requested', postId, { payload, reason });
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const ref = db.collection('admin_approval_requests').doc(key);
    const [existing, post] = await tx.getAll(ref, db.collection('posts').doc(postId));
    if (checkReceipt(existing, hash)) return { ...sanitize(existing.data()) as Record<string, unknown>, idempotent: true };
    if (!post.exists) throw new ValidationError('post_not_found');
    await requireTargetAccountActive(tx, post.get('creator_id'));
    const approval = { id: key, request_hash: hash, requested_by: actorId, action: 'post_metrics_set', resource_type: 'post', resource_id: postId,
      payload, target_version: postVersion(post.data()!), reason, risk_level: 'critical', status: 'pending', decided_by: null,
      expires_at: Timestamp.fromMillis(Date.now() + 30 * 60_000), created_at: FieldValue.serverTimestamp() };
    tx.create(ref, approval);
    writeAudit(tx, derivedKey(key, 'approval-created'), { requestHash: hash, actorId, action: 'approval_requested', resourceType: 'post', resourceId: postId,
      after: { approvalId: key, action: 'post_metrics_set' }, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical' });
    return sanitize(approval);
  });
}
