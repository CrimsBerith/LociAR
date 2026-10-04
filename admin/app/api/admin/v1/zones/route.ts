import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { requireAdminApi } from '../../../../../lib/admin';
import { createProtectedZone } from '../../../../../lib/ops';
import { parseZoneInput } from '../../../../../lib/policy';
import { idempotencyKey, parseJson, requiredString } from '../../../../../lib/validation';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('zones.write');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'zones.write');
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const parsed = parseZoneInput(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    return NextResponse.json(await createProtectedZone(parsed.zone, access.context.user.id, reason, idempotencyKey(request)));
  } catch (error) {
    return apiError(error);
  }
}
