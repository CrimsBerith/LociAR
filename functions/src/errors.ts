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
  'busy_retry',
] as const;
export type Reason = (typeof REASONS)[number];

export function reasonError(code: FunctionsErrorCode, message: string, reason: Reason): HttpsError {
  return new HttpsError(code, message, { reason });
}

/** gRPC ABORTED (10): a Firestore transaction lost lock contention after the SDK's own retries. */
export function isTransactionContention(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 10 || code === 'aborted' || code === 'ABORTED';
}

/**
 * Runs a quota transaction and turns lock contention into a retryable `unavailable/busy_retry`
 * instead of an opaque INTERNAL error (parallel calls by one user all touch the same counter doc).
 */
export async function withContentionGuard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpsError || !isTransactionContention(error)) throw error;
    throw reasonError('unavailable', 'Busy, retry shortly', 'busy_retry');
  }
}
