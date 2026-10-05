/** Pure admin-panel policy helpers (no imports, so node --test can load them directly). */

export const INVITE_TTL_MS = 72 * 3_600_000;
export const SESSION_HOURS = 8;

export type InviteLike = { email?: unknown; status?: unknown; expires_at_ms?: unknown; created_at_ms?: unknown };
export type TokenIdentity = { email?: string | null; emailVerified?: boolean };

/** Why an invite cannot be accepted by this signed-in identity, or null when it can. */
export function inviteAcceptError(invite: InviteLike, identity: TokenIdentity, nowMs: number): string | null {
  if (invite.status !== 'sent') return 'invite_not_pending';
  const expires = typeof invite.expires_at_ms === 'number'
    ? invite.expires_at_ms
    : typeof invite.created_at_ms === 'number' ? invite.created_at_ms + INVITE_TTL_MS : null;
  if (expires == null || nowMs > expires) return 'invite_expired';
  if (identity.emailVerified !== true) return 'invite_email_unverified';
  const invited = typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '';
  if (!invited || !identity.email || identity.email.trim().toLowerCase() !== invited) return 'invite_email_mismatch';
  return null;
}

/** Comment moderation flags carry `metadata.comment_id`; they must never change the post. */
export function commentFlagTarget(flag: { reason?: unknown; metadata?: { comment_id?: unknown } | null }): string | null {
  const id = flag.metadata?.comment_id;
  return typeof id === 'string' && id ? id : null;
}


export function isCommentFlag(flag: { reason?: unknown; metadata?: { comment_id?: unknown; target?: unknown } | null }): boolean {
  return flag.reason === 'comment_filtered' || flag.metadata?.target === 'comment' || typeof flag.metadata?.comment_id === 'string';
}

/** True when `origin` is exactly the configured admin origin (or, in dev, the request's own host). */
export function originAllowed(origin: string | null, host: string | null, adminOrigin: string | undefined): boolean {
  if (!origin || origin === 'null') return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (adminOrigin) {
    try {
      return url.origin === new URL(adminOrigin).origin;
    } catch {
      return false;
    }
  }
  return Boolean(host) && url.host === host;
}

export const ZONE_CATEGORIES = ['school', 'hospital', 'worship', 'government', 'military', 'heritage', 'memorial', 'other'] as const;

export type ZoneInput = { name: string; category: string; lat: number; lng: number; radius_meters: number };

/** Validates a protected zone from the admin form. Returns an error key or the normalised zone. */
export function parseZoneInput(body: Record<string, unknown>): { error: string } | { zone: ZoneInput } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) return { error: 'name must be 2-120 characters' };
  const category = String(body.category ?? '');
  if (!(ZONE_CATEGORIES as readonly string[]).includes(category)) return { error: 'unknown category' };
  const lat = body.lat, lng = body.lng, radius = body.radius_meters;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat must be between -90 and 90' };
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'lng must be between -180 and 180' };
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 20 || radius > 2000) return { error: 'radius_meters must be 20-2000' };
  return { zone: { name, category, lat, lng, radius_meters: Math.round(radius) } };
}

/** The last active super_admin cannot lose that role (the panel would become unmanageable). */
export function roleRevokeError(roleKey: string, activeSuperAdmins: number): string | null {
  if (roleKey === 'super_admin' && activeSuperAdmins <= 1) return 'cannot_revoke_last_super_admin';
  return null;
}
