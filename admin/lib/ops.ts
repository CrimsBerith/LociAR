import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { adminDb, iso } from './firebase-admin';
import { ValidationError } from './validation';

/**
 * Admin operations ported from the Supabase SQL functions (admin_moderate_post,
 * admin_resolve_moderation_flag, admin_set_post_metrics, approval workflow, rate limiter).
 * Each mutation runs in a Firestore transaction and writes one audit record whose document ID is
 * the request's idempotency key, which makes replays no-ops.
 */

export class ConflictError extends ValidationError {
  status = 409;
}

type AuditEntry = {
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
  });
}

export async function recordAudit(idempotencyKey: string, entry: AuditEntry) {
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(adminDb().collection('admin_audit_log').doc(idempotencyKey));
    if (!existing.exists) writeAudit(tx, idempotencyKey, entry);
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
  if (action === 'approve') {
    if (before.age_rating === '18_plus' || before.protected_zone_name) {
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
  tx.update(postRef, update);
  return { ...before, ...update, deleted_at: soft ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
}

export async function moderatePost(postId: string, action: string, actorId: string, reason: string, idempotencyKey: string) {
  if (!MODERATION_STATUS[action]) throw new ValidationError('invalid_moderation_action');
  const db = adminDb();
  const postRef = db.collection('posts').doc(postId);
  return db.runTransaction(async (tx) => {
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new ValidationError('post_not_found');
    if (audit.exists) return sanitize(snap.data());
    const after = applyModeration(tx, postRef, snap.data()!, action, actorId, reason);
    writeAudit(tx, idempotencyKey, {
      actorId, action: `post_${action}`, resourceType: 'post', resourceId: postId,
      before: snap.data(), after, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
    });
    return sanitize(after);
  });
}

export async function resolveModerationFlag(flagId: string, action: string, actorId: string, reason: string, idempotencyKey: string) {
  if (!['dismiss', 'approve', 'flag', 'soft_delete'].includes(action)) throw new ValidationError('invalid_moderation_action');
  const db = adminDb();
  const flagRef = db.collection('moderation_flags').doc(flagId);
  return db.runTransaction(async (tx) => {
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const flagSnap = await tx.get(flagRef);
    if (!flagSnap.exists) throw new ValidationError('moderation_flag_not_found');
    const flag = flagSnap.data()!;
    if (audit.exists || flag.status !== 'open') return sanitize(flag);
    if (action !== 'dismiss' && !flag.post_id) throw new ValidationError('moderation_flag_has_no_post');

    let postSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (action !== 'dismiss') {
      postSnap = await tx.get(db.collection('posts').doc(String(flag.post_id)));
      if (!postSnap.exists) throw new ValidationError('post_not_found');
    }
    if (postSnap) {
      const mapped = action === 'flag' ? 'flag' : action;
      const after = applyModeration(tx, postSnap.ref, postSnap.data()!, mapped, actorId, reason);
      writeAudit(tx, derivedKey(idempotencyKey, 'post'), {
        actorId, action: `post_${mapped}`, resourceType: 'post', resourceId: postSnap.id,
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
      actorId, action: `moderation_flag_${action}`, resourceType: 'moderation_flag', resourceId: flagId,
      before: flag, after: flagAfter, reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive',
    });
    return sanitize(flagAfter);
  });
}

function metricUpdate(values: { views: number; likes: number; comments: number }, actorId: string) {
  return {
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
  const db = adminDb();
  const postRef = db.collection('posts').doc(postId);
  return db.runTransaction(async (tx) => {
    const change = await tx.get(db.collection('admin_metric_changes').doc(idempotencyKey));
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new ValidationError('post_not_found');
    if (change.exists) return sanitize(snap.data());
    const before = snap.data()!;
    tx.update(postRef, metricUpdate(values, actorId));
    tx.create(db.collection('admin_metric_changes').doc(idempotencyKey), {
      post_id: postId,
      actor_id: actorId,
      approval_request_id: approvalRequestId,
      before_values: { views_count: before.views_count ?? 0, likes_count: before.likes_count ?? 0, comments_count: before.comments_count ?? 0 },
      after_values: { views_count: values.views, likes_count: values.likes, comments_count: values.comments },
      reason,
      created_at: FieldValue.serverTimestamp(),
    });
    const after = { ...before, views_count: values.views, likes_count: values.likes, comments_count: values.comments };
    writeAudit(tx, idempotencyKey, {
      actorId, action: 'post_metrics_set', resourceType: 'post', resourceId: postId,
      before, after, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical',
    });
    return sanitize(after);
  });
}

export async function decideApproval(approvalId: string, decision: 'approved' | 'rejected', actorId: string, reason: string, idempotencyKey: string) {
  const db = adminDb();
  const approvalRef = db.collection('admin_approval_requests').doc(approvalId);
  return db.runTransaction(async (tx) => {
    const audit = await tx.get(db.collection('admin_audit_log').doc(idempotencyKey));
    const snap = await tx.get(approvalRef);
    if (!snap.exists) throw new ValidationError('approval_not_found');
    const approval = snap.data()!;
    if (audit.exists || approval.status !== 'pending') return sanitize(approval);

    const finish = (status: string, decisionReason: string) => {
      const update = { status, decided_by: actorId, decided_at: FieldValue.serverTimestamp(), decision_reason: decisionReason };
      tx.update(approvalRef, update);
      const after = { ...approval, ...update, decided_at: new Date().toISOString() };
      writeAudit(tx, idempotencyKey, {
        actorId, action: `approval_${status}`, resourceType: 'admin_approval_request', resourceId: approvalId,
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
    if (postVersion(postSnap.data()!) !== approval.target_version) return finish('invalidated', 'Target changed before approval.');

    const payload = approval.payload as { viewsCount: number; likesCount: number; commentsCount: number };
    const values = { views: payload.viewsCount, likes: payload.likesCount, comments: payload.commentsCount };
    tx.update(postRef, metricUpdate(values, actorId));
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
      actorId, action: 'post_metrics_set', resourceType: 'post', resourceId: postSnap.id,
      before: postSnap.data(), after: { ...postSnap.data(), ...values }, reason, permissionKey: 'posts.metrics.write', riskLevel: 'critical',
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
