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
