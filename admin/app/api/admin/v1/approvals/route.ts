import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { requireAdminApi } from '../../../../../lib/admin';
import { adminDb } from '../../../../../lib/firebase-admin';
import { derivedKey, postVersion, recordAudit } from '../../../../../lib/ops';
import { idempotencyKey, nonnegativeInteger, parseJson, requiredString, uuid } from '../../../../../lib/validation';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('posts.metrics.write');
  if (!access.ok) return unauthorized(access);

  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'approvals.create', 20, 60);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const action = requiredString(body.action, 'action', 3, 120);
    const resourceType = requiredString(body.resourceType, 'resourceType', 3, 120);
    const resourceId = uuid(body.resourceId, 'resourceId').toLowerCase();
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const key = idempotencyKey(request);
    if (action !== 'post_metrics_set') {
      return NextResponse.json({ error: 'Unsupported approval action' }, { status: 400 });
    }
    const requestedPayload = body.payload as Record<string, unknown> | null;
    if (!requestedPayload || typeof requestedPayload !== 'object') {
      return NextResponse.json({ error: 'Metric payload is required' }, { status: 400 });
    }
    const payload = {
      viewsCount: nonnegativeInteger(requestedPayload.viewsCount, 'payload.viewsCount'),
      likesCount: nonnegativeInteger(requestedPayload.likesCount, 'payload.likesCount'),
      commentsCount: nonnegativeInteger(requestedPayload.commentsCount, 'payload.commentsCount'),
    };
    const db = adminDb();
    const post = await db.collection('posts').doc(resourceId).get();
    if (!post.exists) return NextResponse.json({ error: 'Target post not found' }, { status: 404 });

    // The idempotency key is the approval ID, so replays return the existing request.
    const ref = db.collection('admin_approval_requests').doc(key);
    const existing = await ref.get();
    if (existing.exists) return NextResponse.json({ approval: { id: key, ...existing.data() }, idempotent: true });

    const approval = {
      id: key,
      requested_by: access.context.user.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      payload,
      target_version: postVersion(post.data()!),
      reason,
      risk_level: 'critical',
      status: 'pending',
      decided_by: null,
      expires_at: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      created_at: FieldValue.serverTimestamp(),
    };
    await ref.create(approval);
    await recordAudit(derivedKey(key, 'approval-created'), {
      actorId: access.context.user.id, action: 'approval_requested', resourceType: resourceType, resourceId,
      after: { approvalId: key, action, riskLevel: 'critical' }, reason, permissionKey: 'approvals.request', riskLevel: 'critical',
    });
    return NextResponse.json({ approval: { ...approval, created_at: new Date().toISOString() } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
