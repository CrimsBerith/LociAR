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

/** Per-user hourly bucket id for the token rate limit. */
export function tokenQuotaDocId(luid: string, nowMs: number): string {
  return `${luid}_${Math.floor(nowMs / 3_600_000)}`;
}
