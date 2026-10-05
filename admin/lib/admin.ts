import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth, adminDb } from './firebase-admin';
import { isKnownRole, permissionsFor } from './rbac';
import { accountDeletionStarted } from './account-lifecycle';

export { required } from './firebase-admin';

export const SESSION_COOKIE = '__session';

export type AdminContext = {
  user: { id: string; email?: string };
  roles: string[];
  permissions: Set<string>;
  assuranceLevel: 'aal1' | 'aal2';
};

export async function activeRoles(uid: string): Promise<string[]> {
  if (await accountDeletionStarted(uid)) return [];
  const snap = await adminDb()
    .collection('admin_role_assignments')
    .where('user_id', '==', uid)
    .where('revoked_at', '==', null)
    .get();
  return [...new Set(snap.docs.map((d) => String(d.data().role_key)).filter(isKnownRole))];
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) return null;
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

export async function requireAdmin(options?: { permission?: string; requireMfa?: boolean }) {
  const context = await getAdminContext();
  if (!context) redirect('/admin/login?reason=admin_required');
  if (options?.requireMfa !== false && context.assuranceLevel !== 'aal2') redirect('/admin/mfa');
  if (options?.permission && !context.permissions.has(options.permission)) redirect('/admin/unauthorized');
  return context;
}

/** @deprecated Use permission-scoped requireAdmin. */
export async function requireOwner() {
  const context = await requireAdmin({ requireMfa: true });
  if (!context.roles.includes('super_admin')) redirect('/admin/unauthorized');
  return context.user;
}

export async function requireAdminApi(permission: string) {
  const context = await getAdminContext();
  if (!context) return { ok: false as const, status: 401, error: 'Authentication required' };
  if (context.assuranceLevel !== 'aal2') {
    return { ok: false as const, status: 403, error: 'MFA (second factor) is required' };
  }
  if (!context.permissions.has(permission)) {
    return { ok: false as const, status: 403, error: `Missing permission: ${permission}` };
  }
  return { ok: true as const, context };
}
