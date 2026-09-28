import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { adminDb } from '../../../../../../../lib/firebase-admin';
import { postVersion, setPostMetrics } from '../../../../../../../lib/ops';
import { idempotencyKey, nonnegativeInteger, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('posts.metrics.write');
  if (!access.ok) return unauthorized(access);

  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'posts.metrics.write');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { postId: rawPostId } = await context.params;
    const postId = uuid(rawPostId, 'postId').toLowerCase();
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const views = nonnegativeInteger(body.viewsCount, 'viewsCount');
    const likes = nonnegativeInteger(body.likesCount, 'likesCount');
    const comments = nonnegativeInteger(body.commentsCount, 'commentsCount');
    const key = idempotencyKey(request);
    const approvalRequestId = body.approvalRequestId == null ? null : uuid(body.approvalRequestId, 'approvalRequestId');

    const db = adminDb();
    const snap = await db.collection('posts').doc(postId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const before = snap.data()!;

    const absoluteDelta =
      Math.abs(views - Number(before.views_count ?? 0)) +
      Math.abs(likes - Number(before.likes_count ?? 0)) +
      Math.abs(comments - Number(before.comments_count ?? 0));
    if (absoluteDelta >= 10_000 && !approvalRequestId) {
      return NextResponse.json({
        error: 'A second-admin approval is required for metric changes of 10,000 or more.',
        code: 'approval_required',
      }, { status: 409 });
    }

    if (approvalRequestId) {
      const approvalSnap = await db.collection('admin_approval_requests').doc(approvalRequestId).get();
      const approval = approvalSnap.data();
      const expiresAt = approval?.expires_at instanceof Timestamp ? approval.expires_at.toMillis() : 0;
      if (
        !approval ||
        approval.status !== 'approved' ||
        approval.action !== 'post_metrics_set' ||
        approval.resource_id !== postId ||
        !approval.decided_by ||
        approval.decided_by === approval.requested_by ||
        approval.target_version !== postVersion(before) ||
        expiresAt <= Date.now()
      ) {
        return NextResponse.json({ error: 'Approval is invalid, expired, or not independent.' }, { status: 409 });
      }
    }

    const post = await setPostMetrics(postId, { views, likes, comments }, access.context.user.id, reason, key, approvalRequestId);
    return NextResponse.json({ post });
  } catch (error) {
    return apiError(error);
  }
}
