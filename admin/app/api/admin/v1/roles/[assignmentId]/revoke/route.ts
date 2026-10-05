import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { revokeAdminRole } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('admin_users.write');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'admin_users.write', 10);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { assignmentId } = await context.params;
    if (!/^[A-Za-z0-9_-]{3,200}$/.test(assignmentId)) return NextResponse.json({ error: 'invalid assignment id' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    return NextResponse.json({ assignment: await revokeAdminRole(assignmentId, access.context.user.id, reason, idempotencyKey(request)) });
  } catch (error) {
    return apiError(error);
  }
}
