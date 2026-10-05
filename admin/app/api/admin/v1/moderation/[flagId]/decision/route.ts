import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { resolveModerationFlag } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../../lib/validation';

const actions = new Set(['dismiss', 'approve', 'flag', 'soft_delete']);

export async function POST(request: Request, context: { params: Promise<{ flagId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('posts.moderate');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'moderation.decide', 30, 60);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { flagId: rawFlagId } = await context.params;
    const flagId = requiredString(rawFlagId, 'flagId', 1, 160);
    if (!/^[A-Za-z0-9_-]+$/.test(flagId)) return NextResponse.json({ error: 'Invalid flag ID' }, { status: 400 });
    const action = requiredString(body.action, 'action', 3, 30);
    if (!actions.has(action)) return NextResponse.json({ error: 'Unsupported moderation decision' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const flag = await resolveModerationFlag(flagId, action, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ flag });
  } catch (error) {
    return apiError(error);
  }
}
