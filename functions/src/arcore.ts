import { onCall } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';
import { db, ENFORCE_APP_CHECK, FieldValue, HttpsError, requireCaller, Timestamp } from './core';
import { profileBlock } from './profileGuard';
import { reasonError } from './errors';
import { buildArcoreClaims, tokenQuotaDocId } from './arcoreToken';

/**
 * Keyless ARCore authorization: the app never holds a Google credential. This callable signs a
 * one-hour JWT with the Functions runtime service account through the IAM Credentials API
 * (no key file). The runtime account needs roles/iam.serviceAccountTokenCreator on itself,
 * and the ARCore API must be enabled (docs/FIREBASE_SETUP.md).
 */
const TOKENS_PER_HOUR = 30;
const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
let signerEmail: string | null = process.env.ARCORE_SIGNER_EMAIL || null;

async function runtimeServiceAccountEmail(): Promise<string> {
  if (signerEmail) return signerEmail;
  const credentials = await googleAuth.getCredentials();
  if (!credentials.client_email) throw new Error('Runtime service account email unavailable');
  signerEmail = credentials.client_email;
  return signerEmail;
}

async function signJwt(email: string, payload: object): Promise<string> {
  const client = await googleAuth.getClient();
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signJwt`;
  const response = await client.request<{ signedJwt: string }>({ url, method: 'POST', data: { payload: JSON.stringify(payload) } });
  return response.data.signedJwt;
}

export const getArcoreToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = requireCaller(request);
  const profile = await db.collection('profiles').doc(caller.luid).get();
  const blocked = profileBlock(profile.data());
  if (blocked) throw reasonError('permission-denied', blocked.message, blocked.reason);
  const now = Date.now();
  const quotaRef = db.collection('arcore_token_quota').doc(tokenQuotaDocId(caller.luid, now));
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef);
    const count = Number(snap.data()?.count ?? 0);
    if (count >= TOKENS_PER_HOUR) return false;
    tx.set(quotaRef, {
      count: FieldValue.increment(1),
      // TTL policy on expires_at removes old buckets.
      expires_at: Timestamp.fromMillis(now + 2 * 3_600_000),
    }, { merge: true });
    return true;
  });
  if (!allowed) throw reasonError('resource-exhausted', 'ARCore token limit reached', 'rate_limited');

  try {
    const claims = buildArcoreClaims(await runtimeServiceAccountEmail(), now / 1000);
    const token = await signJwt(claims.iss, claims);
    return { token, expiresAt: new Date(claims.exp * 1000).toISOString() };
  } catch (error) {
    console.error('arcore_token_failed', error);
    // Signing failed (IAM outage): give the slot back so the user is not locked out for an hour.
    await quotaRef.set({ count: FieldValue.increment(-1) }, { merge: true }).catch(() => undefined);
    throw new HttpsError('unavailable', 'ARCore authorization is temporarily unavailable');
  }
});
