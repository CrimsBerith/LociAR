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
  'draft_expired',
  'handle_taken',
  'handle_reserved',
  'handle_not_allowed',
  'handle_cooldown',
  'reauth_required',
  'session_changed',
  'apple_revoke_failed',
  'apple_revoke_unavailable',
  'deletion_pending',
  'service_paused',
  'busy_retry',
  'invite_required',
  'invite_invalid',
] as const;
export type Reason = (typeof REASONS)[number];

export function reasonError(code: FunctionsErrorCode, message: string, reason: Reason): HttpsError {
  return new HttpsError(code, message, { reason });
}

/** Contention can remain after Firestore's bounded retries; callers can retry safely. */
export function isTransactionContention(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 10 || code === 'aborted' || code === 'ABORTED';
}

export async function withContentionGuard<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof HttpsError || !isTransactionContention(error)) throw error;
    throw reasonError('unavailable', 'Busy, retry shortly', 'busy_retry');
  }
}
