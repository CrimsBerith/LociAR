import 'server-only';
import { adminAuth, adminDb } from './firebase-admin';
import { isKnownRole, permissionsFor } from './rbac';
import { accountDeletionStarted } from './account-lifecycle';
import { readAdminEmailSession } from './admin-email-auth';

export const SESSION_COOKIE = '__session';

export type AdminContext = {
  user: { id: string; email?: string };
  roles: string[];
  permissions: Set<string>;
  assuranceLevel: 'aal1' | 'aal2' | 'email_code';
};

/** Email-only admin sign-in is an explicit owner choice; it must never be labelled MFA/AAL2. */
export function verifiedAdminSession(context: Pick<AdminContext, 'assuranceLevel'>) {
  return context.assuranceLevel === 'aal2' || context.assuranceLevel === 'email_code';
}

export async function activeRoles(uid: string): Promise<string[]> {
  if (await accountDeletionStarted(uid)) return [];
  const snap = await adminDb()
    .collection('admin_role_assignments')
    .where('user_id', '==', uid)
    .where('revoked_at', '==', null)
    .get();
  return [...new Set(snap.docs.map((d) => String(d.data().role_key)).filter(isKnownRole))];
}

export async function getAdminContextForSession(session: string | null): Promise<AdminContext | null> {
  if (!session) return null;
  if (session.startsWith('email1.')) {
    const identity = await readAdminEmailSession(session);
    if (!identity) return null;
    const roles = await activeRoles(identity.uid);
    if (!roles.length) return null;
    return { user: { id: identity.uid, email: identity.email }, roles, permissions: permissionsFor(roles), assuranceLevel: 'email_code' };
  }
  let decoded;
  try {
    decoded = await adminAuth().verifySessionCookie(session, true);
  } catch {
    return null;
  }
  const roles = await activeRoles(decoded.uid);
  if (roles.length === 0) return null;
  const secondFactor = (decoded.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor;
  return {
    user: { id: decoded.uid, email: decoded.email },
    roles,
    permissions: permissionsFor(roles),
    assuranceLevel: secondFactor ? 'aal2' : 'aal1',
  };
}

