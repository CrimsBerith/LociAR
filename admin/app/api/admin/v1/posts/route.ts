import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { requireAdminApi } from '../../../../../lib/admin';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../lib/validation';
import { parseContentInput, saveAdminPost } from '../../../../../lib/content-ops';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('posts.create'); if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'posts.create', 30, 60); if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const post = await saveAdminPost(parseContentInput(body), access.context.user.id, requiredString(body.reason, 'reason', 8, 1000), idempotencyKey(request));
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) { return apiError(error); }
}
