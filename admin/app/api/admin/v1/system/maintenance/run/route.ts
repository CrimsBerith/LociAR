import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { requestMaintenanceRun } from '../../../../../../../lib/maintenance';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../../lib/validation';

/** "Run now" for one maintenance task (admin/lib/maintenance.ts); the onMaintenanceRequested trigger runs it. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('system.maintenance');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'system.maintenance.run', 20);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const queued = await requestMaintenanceRun(body.task, access.context.user.id, reason, idempotencyKey(request));
    return NextResponse.json({ request: queued });
  } catch (error) {
    return apiError(error);
  }
}
