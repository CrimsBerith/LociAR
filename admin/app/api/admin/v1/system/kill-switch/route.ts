import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { adminDb } from '../../../../../../lib/firebase-admin';
import { recordAudit } from '../../../../../../lib/ops';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../lib/validation';

/**
 * Emergency stop for new posts, ARCore tokens, anchor registration and avatar uploads
 * (functions/src/core.ts → assertServiceEnabled). Reads, reports and account deletion keep working.
 */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('system.kill_switch');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'system.kill_switch', 10);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const ref = adminDb().collection('system').doc('flags');
    const before = (await ref.get()).data() ?? {};
    const after = { kill_switch: body.enabled, kill_reason: body.enabled ? reason : null };
    await ref.set({ ...after, updated_by: access.context.user.id, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    await recordAudit(idempotencyKey(request), {
      actorId: access.context.user.id, action: body.enabled ? 'kill_switch_on' : 'kill_switch_off', resourceType: 'system_flags',
      resourceId: 'flags', before, after, reason, permissionKey: 'system.kill_switch', riskLevel: 'critical',
    });
    return NextResponse.json({ flags: after });
  } catch (error) {
    return apiError(error);
  }
}
