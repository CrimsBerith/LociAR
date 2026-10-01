/**
 * Pure helpers for ARCore keyless authorization (kept free of Firebase imports so they are
 * unit-testable). See https://developers.google.com/ar/develop/authorization?platform=ios
 */
export const ARCORE_AUDIENCE = 'https://arcore.googleapis.com/';
export const ARCORE_TOKEN_TTL_SECONDS = 3600;

export type ArcoreClaims = { iss: string; sub: string; aud: string; iat: number; exp: number };

export function buildArcoreClaims(serviceAccountEmail: string, nowSeconds: number): ArcoreClaims {
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$|^[^@\s]+@developer\.gserviceaccount\.com$|^[^@\s]+@appspot\.gserviceaccount\.com$/.test(serviceAccountEmail)) {
    throw new Error('ARCore signer must be a Google service account');
  }
  const iat = Math.floor(nowSeconds);
  return { iss: serviceAccountEmail, sub: serviceAccountEmail, aud: ARCORE_AUDIENCE, iat, exp: iat + ARCORE_TOKEN_TTL_SECONDS };
}

/**
 * Cloud Anchors older than `graceMs` that no post references. The grace period covers pins that
 * were hosted but whose post is still being published (offline queue).
 */
export function selectOrphanAnchors(
  anchors: Array<{ id: string; createTime: string }>,
  referenced: Set<string>,
  nowMs: number,
  graceMs: number,
): string[] {
  return anchors
    .filter((a) => {
      const created = Date.parse(a.createTime);
      return Number.isFinite(created) && nowMs - created > graceMs && !referenced.has(a.id);
    })
    .map((a) => a.id);
}

/** Per-user hourly bucket id for the token rate limit. */
export function tokenQuotaDocId(luid: string, nowMs: number): string {
  return `${luid}_${Math.floor(nowMs / 3_600_000)}`;
}
