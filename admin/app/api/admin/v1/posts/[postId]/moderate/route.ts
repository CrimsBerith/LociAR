import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { moderatePost } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';

const actions = new Set(['approve', 'flag', 'soft_delete', 'restore']);

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('posts.moderate');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'posts.moderate');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { postId: rawPostId } = await context.params;
    const postId = uuid(rawPostId, 'postId').toLowerCase();
    const action = requiredString(body.action, 'action', 3, 30);
    if (!actions.has(action)) return NextResponse.json({ error: 'Unsupported moderation action' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const post = await moderatePost(postId, action, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ post });
  } catch (error) {
    return apiError(error);
  }
}
