import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/**
 * Machine-readable reasons sent in `HttpsError.details.reason`. Clients switch on these instead of
 * matching the English message text (which stays unchanged for older app versions).
 */
export const REASONS = [
  'profile_missing',
  'invalid_avatar',
  'avatar_not_found',
  'account_suspended',
  'identity_unverified',
  'protected_zone',
  'rate_limited',
  'handle_taken',
  'handle_reserved',
  'handle_not_allowed',
  'handle_cooldown',
  'reauth_required',
  'apple_revoke_failed',
  'apple_revoke_unavailable',
  'service_paused',
] as const;
export type Reason = (typeof REASONS)[number];

export function reasonError(code: FunctionsErrorCode, message: string, reason: Reason): HttpsError {
  return new HttpsError(code, message, { reason });
}
