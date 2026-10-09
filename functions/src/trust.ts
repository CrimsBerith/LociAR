import { db } from './core';

/**
 * Trusted-author auto-publish (growth plan 3.3). Off unless LOCIAR_TRUSTED_AUTO_PUBLISH=true,
 * because the App Review notes promise that every post is reviewed first: update them before
 * turning this on. A post still needs a persistent, high-quality AR resolver to skip review, and
 * drawings are never auto-published.
 */
export const TRUSTED_AUTO_PUBLISH = process.env.LOCIAR_TRUSTED_AUTO_PUBLISH === 'true';
export const TRUST_MIN_ACCOUNT_AGE_MS = 7 * 86_400_000;
export const TRUST_MIN_PUBLIC_POSTS = 5;

export type TrustInput = {
  accountCreatedAtMs: number | null;
  publicPostCount: number;
  hasFlaggedPost: boolean;
  trustRevoked: boolean;
};

/** Pure rule: old enough, enough approved public posts, nothing flagged, not revoked by an admin. */
export function isTrustedAuthor(input: TrustInput, now: number): boolean {
  if (input.trustRevoked || input.hasFlaggedPost) return false;
  if (input.accountCreatedAtMs == null || now - input.accountCreatedAtMs < TRUST_MIN_ACCOUNT_AGE_MS) return false;
  return input.publicPostCount >= TRUST_MIN_PUBLIC_POSTS;
}

export function hasDrawingLayer(editData: unknown): boolean {
  const layers = (editData as { layers?: unknown[] } | null)?.layers;
  return Array.isArray(layers) && layers.some((l) => String(((l ?? {}) as Record<string, unknown>).type ?? ((l ?? {}) as Record<string, unknown>).kind) === 'drawing');
}

/**
 * Loads what the rule needs. Moderator removals are not detected here (only `flagged` posts and the
 * `users_private.trust_revoked` switch), so admins must set `trust_revoked: true` on repeat offenders.
 */
export async function authorIsTrusted(luid: string, profile: FirebaseFirestore.DocumentData, now: number): Promise<boolean> {
  const [priv, flagged] = await Promise.all([
    db.collection('users_private').doc(luid).get(),
    db.collection('posts').where('creator_id', '==', luid).where('status', '==', 'flagged').limit(1).get(),
  ]);
  return isTrustedAuthor({
    accountCreatedAtMs: profile.created_at?.toMillis?.() ?? null,
    publicPostCount: Number(profile.public_post_count ?? 0),
    hasFlaggedPost: !flagged.empty,
    trustRevoked: priv.get('trust_revoked') === true,
  }, now);
}
