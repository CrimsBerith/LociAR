import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { decideApproval } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ approvalId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('posts.metrics.write');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'approvals.decide', 20, 60);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { approvalId: rawApprovalId } = await context.params;
    const approvalId = uuid(rawApprovalId, 'approvalId');
    const decision = requiredString(body.decision, 'decision', 8, 8);
    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ error: 'Decision must be approved or rejected' }, { status: 400 });
    }
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const approval = await decideApproval(approvalId, decision, access.context.user.id, reason, idempotencyKey(request)) as { status?: string };
    if (approval.status === 'expired' || (decision === 'approved' && approval.status === 'invalidated')) {
      return NextResponse.json({
        error: approval.status === 'expired'
          ? 'Approval request expired.'
          : 'Target changed; approval request was invalidated.',
        approval,
      }, { status: 409 });
    }
    return NextResponse.json({ approval });
  } catch (error) {
    return apiError(error);
  }
}
