import type { Reason } from './errors';
import { reasonError } from './errors';
import { db } from './core';

/** Permanent server-only fence. It survives deletion of the public profile and Auth user. */
export const accountDeletionRef = (luid: string) => db.collection('account_deletion_jobs').doc(luid);

export async function isAccountDeleting(tx: FirebaseFirestore.Transaction, luid: string): Promise<boolean> {
  return (await tx.get(accountDeletionRef(luid))).exists;
}

export async function assertAccountNotDeleting(tx: FirebaseFirestore.Transaction, luid: string): Promise<void> {
  if (await isAccountDeleting(tx, luid)) {
    throw reasonError('permission-denied', 'Account deletion is in progress', 'profile_missing');
  }
}

/** Read inside the SAME transaction as the write, before its first write. */
export async function requireActiveAccount(tx: FirebaseFirestore.Transaction, luid: string): Promise<FirebaseFirestore.DocumentData> {
  await assertAccountNotDeleting(tx, luid);
  const profile = await tx.get(db.collection('profiles').doc(luid));
  const blocked = profileBlock(profile.data());
  if (blocked) throw reasonError('permission-denied', blocked.message, blocked.reason);
  return profile.data()!;
}

/** Why a profile may not use signed-in features, or null when it is active. */
export function profileBlock(profile: { suspended?: unknown; deleted_at?: unknown } | undefined): { message: string; reason: Reason } | null {
  if (!profile || profile.deleted_at) return { message: 'Profile missing; call ensureProfile first', reason: 'profile_missing' };
  if (profile.suspended === true) return { message: 'This account cannot publish', reason: 'account_suspended' };
  return null;
}
