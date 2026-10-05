import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../../lib/validation';
import { saveAdminComment, removeAdminComment } from '../../../../../../../lib/content-ops';

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('comments.write'); if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'comments.write'); if (rateLimitError) return rateLimitError;
    const { postId: rawId } = await context.params; const postId = uuid(rawId, 'postId').toLowerCase();
    const body = await parseJson(request); const reason = requiredString(body.reason, 'reason', 8, 1000); const key = idempotencyKey(request);
    const action = requiredString(body.action, 'action', 3, 20);
    if (action === 'delete') {
      const comment = await removeAdminComment(postId, uuid(body.commentId, 'commentId').toLowerCase(), access.context.user.id, reason, key);
      return NextResponse.json({ comment });
    }
    if (action !== 'create' && action !== 'edit') return NextResponse.json({ error: 'Unsupported comment action' }, { status: 400 });
    const comment = await saveAdminComment(postId, uuid(body.authorId, 'authorId').toLowerCase(), requiredString(body.text, 'text', 1, 500), access.context.user.id, reason, key,
      action === 'edit' ? uuid(body.commentId, 'commentId').toLowerCase() : undefined);
    return NextResponse.json({ comment }, { status: action === 'create' ? 201 : 200 });
  } catch (error) { return apiError(error); }
}
