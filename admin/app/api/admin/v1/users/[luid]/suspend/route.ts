import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { setUserSuspended } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ luid: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('users.suspend');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'users.suspend');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { luid: rawLuid } = await context.params;
    const luid = uuid(rawLuid, 'luid').toLowerCase();
    if (typeof body.suspended !== 'boolean') return NextResponse.json({ error: 'suspended must be a boolean' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const user = await setUserSuspended(luid, body.suspended, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
