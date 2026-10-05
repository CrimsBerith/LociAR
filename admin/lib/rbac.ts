/** Static role → permission catalogue (ported from the Supabase admin_roles seed). */
export const PERMISSIONS = [
  'dashboard.read', 'users.read', 'users.invite', 'users.suspend', 'users.terminate',
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
  ad_operations_admin: ['dashboard.read'],
  finance_admin: ['dashboard.read'],
};

export function isKnownRole(role: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

export function permissionsFor(roles: string[]): Set<string> {
  const result = new Set<string>();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  return result;
}
