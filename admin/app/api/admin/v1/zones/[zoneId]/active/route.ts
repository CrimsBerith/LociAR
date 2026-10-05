import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { setProtectedZoneActive } from '../../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../../lib/validation';

export async function POST(request: Request, context: { params: Promise<{ zoneId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('zones.write');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'zones.write');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const { zoneId } = await context.params;
    if (!/^(?:[a-f0-9]{8,40}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(zoneId)) return NextResponse.json({ error: 'invalid zone id' }, { status: 400 });
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    return NextResponse.json({ zone: await setProtectedZoneActive(zoneId, body.active, access.context.user.id, reason, idempotencyKey(request)) });
  } catch (error) {
    return apiError(error);
  }
}
