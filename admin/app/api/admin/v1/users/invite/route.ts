import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { createUserInvitation } from '../../../../../../lib/admin-invite';
import { isKnownRole } from '../../../../../../lib/rbac';
import { idempotencyKey, parseJson, requiredString } from '../../../../../../lib/validation';

/**
 * Records an invitation and makes sure a Firebase Auth user exists for the email. The admin UI then
 * sends the Firebase sign-in link from the browser (Firebase's own mailer); the role is granted when
 * the invitee first creates a session (lib/admin-invite.ts).
 */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminApi('users.invite');
  if (!access.ok) return unauthorized(access);
  try {
    const rateLimitError = await enforceRateLimit(access.context.user.id, 'users.invite', 5, 600);
    if (rateLimitError) return rateLimitError;
    const body = await parseJson(request);
    const email = requiredString(body.email, 'email', 3, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    const handle = body.handle == null ? null : requiredString(body.handle, 'handle', 3, 40);
    const roleKey = body.roleKey == null ? null : requiredString(body.roleKey, 'roleKey', 3, 80);
    const reason = requiredString(body.reason, 'reason', 8, 1000);
    const key = idempotencyKey(request);
    if (roleKey && (!isKnownRole(roleKey) || roleKey === 'super_admin')) {
      return NextResponse.json({ error: 'Unknown admin role' }, { status: 400 });
    }

    const result = await createUserInvitation({ key, email, handle, roleKey, reason, actorId: access.context.user.id });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
