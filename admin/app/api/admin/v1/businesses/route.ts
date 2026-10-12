import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../../lib/admin';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { operateBusiness } from '../../../../../lib/businesses';
import { idempotencyKey, parseJson, requiredString } from '../../../../../lib/validation';

export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  try {
    const body = await parseJson(request);
    if (!['update', 'invalidate', 'revalidate'].includes(String(body.action))) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const admin = await requireAdminApi(body.action === 'update' ? 'places.write' : 'posts.moderate'); if (!admin.ok) return unauthorized(admin);
    await enforceRateLimit(admin.context.user.id, 'business_ops', 20, 60);
    const reason = requiredString(body.reason, 'reason', 8, 1000), key = idempotencyKey(request);
    const result = await operateBusiness(body, admin.context.user.id, reason, key);
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
