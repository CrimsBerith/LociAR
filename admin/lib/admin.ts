import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminContextForSession, SESSION_COOKIE, verifiedAdminSession, type AdminContext } from './admin-session';
import { needsStepUp } from './rbac';
export { needsStepUp } from './rbac';
export { required } from './firebase-admin';
export { activeRoles, SESSION_COOKIE, verifiedAdminSession, type AdminContext } from './admin-session';

export async function getAdminContext(sessionOverride?: string | null): Promise<AdminContext | null> {
  const session = sessionOverride === undefined ? (await cookies()).get(SESSION_COOKIE)?.value ?? null : sessionOverride;
  return getAdminContextForSession(session);
}

export async function requireAdmin(options?: { permission?: string; requireVerifiedSession?: boolean }) {
  const context = await getAdminContext();
  if (!context) redirect('/admin/login?reason=admin_required');
  if (options?.requireVerifiedSession !== false && !verifiedAdminSession(context)) redirect('/admin/mfa');
  if (options?.permission && !context.permissions.has(options.permission)) redirect('/admin/unauthorized');
  return context;
}

/** @deprecated Use permission-scoped requireAdmin. */
export async function requireOwner() {
  const context = await requireAdmin({ requireVerifiedSession: true });
  if (!context.roles.includes('super_admin')) redirect('/admin/unauthorized');
  return context.user;
}

export async function requireAdminApi(permission: string) {
  const context = await getAdminContext();
  if (!context) return { ok: false as const, status: 401, error: 'Authentication required' };
  if (!verifiedAdminSession(context)) {
    return { ok: false as const, status: 403, error: 'Email-code verification or MFA is required' };
  }
  if (needsStepUp(context, permission)) {
    return { ok: false as const, status: 403, error: 'Sign in with an authenticator code for this action' };
  }
  if (!context.permissions.has(permission)) {
    return { ok: false as const, status: 403, error: `Missing permission: ${permission}` };
  }
  return { ok: true as const, context };
}
