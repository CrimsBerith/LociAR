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
  // One round trip for both fence documents; the deletion fence is still evaluated first.
  const [deletion, profile] = await tx.getAll(accountDeletionRef(luid), db.collection('profiles').doc(luid));
  if (deletion.exists) throw reasonError('permission-denied', 'Account deletion is in progress', 'profile_missing');
  const blocked = profileBlock(profile.data());
  if (blocked) throw reasonError('permission-denied', blocked.message, blocked.reason);
  return profile.data()!;
}

/** requireActiveAccount for read-only callers: the same fence, without a transaction's extra round trips. */
export async function requireActiveAccountNow(luid: string): Promise<FirebaseFirestore.DocumentData> {
  const [deletion, profile] = await db.getAll(accountDeletionRef(luid), db.collection('profiles').doc(luid));
  if (deletion.exists) throw reasonError('permission-denied', 'Account deletion is in progress', 'profile_missing');
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

/** Must match AvatarReference.presets (iOS) and avatarPreset() in firestore.rules. */
const AVATAR_PRESETS = new Set(['hare', 'tortoise', 'cat', 'dog', 'bear', 'bird', 'fish', 'leaf', 'star', 'moon', 'sun', 'bolt']);

/**
 * The avatar a post carries for its author: an uploaded photo, else a preset as the
 * `avatar-preset:<name>` URL the app already renders (LociAvatar), else none.
 */
export function postAvatarURL(profile: { avatar_url?: unknown; avatar_preset?: unknown } | undefined): string | null {
  if (typeof profile?.avatar_url === 'string' && profile.avatar_url) return profile.avatar_url;
  const preset = profile?.avatar_preset;
  return typeof preset === 'string' && AVATAR_PRESETS.has(preset) ? `avatar-preset:${preset}` : null;
}
