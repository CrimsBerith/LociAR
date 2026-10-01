import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { decideAvatar } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ luid: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('users.suspend');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'avatars.decide');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { luid: rawLuid } = await context.params;
    const luid = uuid(rawLuid, 'luid').toLowerCase();
    if (body.action !== 'approve' && body.action !== 'remove') {
      return NextResponse.json({ error: 'Unsupported avatar action' }, { status: 400 });
    }
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const review = await decideAvatar(luid, body.action, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ review });
  } catch (error) {
    return apiError(error);
  }
}
