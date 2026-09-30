import type { Reason } from './errors';

/** Why a profile may not use signed-in features, or null when it is active. */
export function profileBlock(profile: { suspended?: unknown; deleted_at?: unknown } | undefined): { message: string; reason: Reason } | null {
  if (!profile || profile.deleted_at) return { message: 'Profile missing; call ensureProfile first', reason: 'profile_missing' };
  if (profile.suspended === true) return { message: 'This account cannot publish', reason: 'account_suspended' };
  return null;
}
