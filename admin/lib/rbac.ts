/** Static role → permission catalogue (ported from the Supabase admin_roles seed). */
export const PERMISSIONS = [
  'dashboard.read', 'users.read', 'users.invite', 'users.suspend', 'users.terminate',
  'users.location.read', 'users.telemetry.read',
  'brands.write', 'campaigns.read', 'campaigns.write', 'campaigns.audience', 'notifications.send',
  'posts.read', 'posts.create', 'posts.edit', 'comments.write', 'users.create', 'zones.override', 'posts.moderate', 'posts.purge', 'posts.metrics.write',
  'anchors.read', 'anchors.disable', 'anchors.retire', 'places.write', 'zones.write',
  'flags.production.write', 'system.kill_switch', 'ads.approve', 'finance.refund',
  'audit.read', 'audit.export', 'admin_users.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  trust_safety_admin: ['dashboard.read', 'users.read', 'users.suspend', 'posts.read', 'posts.moderate', 'audit.read'],
  ar_operations_admin: ['dashboard.read', 'posts.read', 'anchors.read', 'anchors.disable', 'anchors.retire', 'places.write', 'zones.write', 'audit.read'],
  product_operations: ['dashboard.read', 'flags.production.write', 'audit.read'],
  engineering_observer: ['dashboard.read', 'anchors.read', 'audit.read'],
  analyst: ['dashboard.read', 'anchors.read', 'audit.read'],
  support_agent: ['dashboard.read', 'users.read'],
  legal_privacy_admin: ['dashboard.read', 'users.read', 'audit.read', 'audit.export'],
  ad_operations_admin: ['dashboard.read', 'campaigns.read'],
  finance_admin: ['dashboard.read'],
};

/**
 * Permissions that need an authenticator (TOTP, AAL2) session even though email-code sign-in is the
 * default: they expose people's precise location, device and network data or bulk audit exports, or
 * change who holds admin power. An email inbox alone must not unlock them (owner decision 17 Oct 2026).
 */
export const STEP_UP_PERMISSIONS: ReadonlySet<string> = new Set(['users.location.read', 'users.telemetry.read', 'admin_users.write', 'audit.export']);

/** Role permissions for a session; an email-code session never carries the step-up permissions. */
export function sessionPermissions(roles: string[], assurance: 'aal1' | 'aal2' | 'email_code'): Set<string> {
  const granted = permissionsFor(roles);
  if (assurance === 'email_code') for (const permission of STEP_UP_PERMISSIONS) granted.delete(permission);
  return granted;
}

/** True when the roles grant `permission` but this email-code session must step up to TOTP first. */
export function needsStepUp(context: { roles: string[]; assuranceLevel: 'aal1' | 'aal2' | 'email_code' }, permission: string): boolean {
  return context.assuranceLevel === 'email_code' && STEP_UP_PERMISSIONS.has(permission) && permissionsFor(context.roles).has(permission);
}

export function isKnownRole(role: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

export function permissionsFor(roles: string[]): Set<string> {
  const result = new Set<string>();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  return result;
}
