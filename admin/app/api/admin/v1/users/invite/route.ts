import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { INVITE_TTL_MS } from '../../../../../../lib/policy';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { adminAuth, adminDb } from '../../../../../../lib/firebase-admin';
import { recordAudit } from '../../../../../../lib/ops';
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

    const db = adminDb();
    const ref = db.collection('admin_user_invites').doc(key);
    const existing = await ref.get();
    if (existing.exists) return NextResponse.json({ invite: { id: key, ...existing.data() }, email, idempotent: true });

    let invitedUser;
    try {
      invitedUser = await adminAuth().getUserByEmail(email);
    } catch (error) {
      // Only a genuine "no such user" creates an account; any other lookup failure is a 500.
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      invitedUser = await adminAuth().createUser({ email, emailVerified: false });
    }

    const invite = {
      id: key,
      email,
      handle,
      requested_role_key: roleKey,
      invited_user_id: invitedUser.uid,
      invited_by: access.context.user.id,
      status: 'sent',
      reason,
      created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
    };
    await ref.create(invite);
    await recordAudit(key, {
      actorId: access.context.user.id,
      action: 'user_invited',
      resourceType: 'user_invite',
      resourceId: key,
      after: { email, handle, roleKey },
      reason,
      permissionKey: 'users.invite',
      riskLevel: 'sensitive',
    });
    return NextResponse.json({ invite: { ...invite, created_at: new Date().toISOString() }, email }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
