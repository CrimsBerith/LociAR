import { scalarText } from '../../../../../../../lib/values';
import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { parseJson } from '../../../../../../../lib/validation';
import { readPrivateUserContext } from '../../../../../../../lib/user-context';

export async function POST(request: Request, context: { params: Promise<{ luid: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  try {
    const body = await parseJson(request);
    if (body.kind !== 'location' && body.kind !== 'telemetry') return NextResponse.json({ error: 'Invalid data kind' }, { status: 400 });
    const access = await requireAdminApi(body.kind === 'location' ? 'users.location.read' : 'users.telemetry.read');
    if (!access.ok) return unauthorized(access);
    const limited = await enforceRateLimit(access.context.user.id, 'user-context.read', 20);
    if (limited) return limited;
    const { luid } = await context.params;
    const result = await readPrivateUserContext(access.context, luid, body.kind, scalarText(body.reason ?? ''));
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return apiError(error); }
}
