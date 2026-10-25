import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { setMaintenancePaused } from '../../../../../../../lib/maintenance';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../../lib/validation';

/** Pause or resume the automatic runs of one maintenance task; account deletion retries cannot be paused. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('system.maintenance');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'system.maintenance.pause', 20);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    if (typeof body.paused !== 'boolean') return NextResponse.json({ error: 'paused must be a boolean' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const after = await setMaintenancePaused(body.task, body.paused, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ maintenance: after });
  } catch (error) {
    return apiError(error);
  }
}
