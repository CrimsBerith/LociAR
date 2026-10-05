import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';
import { parseContentInput, saveAdminPost } from '../../../../../../../lib/content-ops';

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('posts.edit'); if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'posts.edit'); if (rateLimitError) return rateLimitError;
    const { postId } = await context.params; const body = await parseJson(request);
    const post = await saveAdminPost(parseContentInput(body), access.context.user.id, requiredString(body.reason, 'reason', 8, 1000), idempotencyKey(request), uuid(postId, 'postId').toLowerCase());
    return NextResponse.json({ post });
  } catch (error) { return apiError(error); }
}
