import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { requireAdminApi } from '../../../../../lib/admin';
import { requestMetricApproval } from '../../../../../lib/ops';
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
    if (resourceType !== 'post') return NextResponse.json({ error: 'Unsupported resource type' }, { status: 400 });
    const approval = await requestMetricApproval(resourceId, payload, access.context.user.id, reason, key);
    const idempotent = (approval as Record<string, unknown>).idempotent === true;
    return NextResponse.json({ approval, idempotent }, { status: idempotent ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
