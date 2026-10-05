import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../../lib/validation';
import { createManagedUser } from '../../../../../../lib/content-ops';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('users.create'); if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'users.create', 10, 60); if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const user = await createManagedUser({handle:requiredString(body.handle,'handle',3,30),displayName:requiredString(body.displayName,'displayName',1,60),email:typeof body.email === 'string' ? body.email : ''},
      access.context.user.id,requiredString(body.reason,'reason',8,1000),idempotencyKey(request));
    return NextResponse.json({ user },{status:201});
  } catch(error){return apiError(error);}
}
