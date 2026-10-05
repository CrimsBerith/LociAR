import { onCall } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';
import { assertServiceEnabled, logger, safeErrorCode, db, CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, FieldValue, HttpsError, requireCaller, Timestamp } from './core';
import { requireActiveAccount, isAccountDeleting } from './profileGuard';
import { reasonError } from './errors';
import { buildArcoreClaims, tokenQuotaDocId } from './arcoreToken';

/**
 * Keyless ARCore authorization: the app never holds a Google credential. This callable signs a
 * one-hour JWT through the IAM Credentials API (no key file) as ARCORE_SIGNER_EMAIL, a dedicated
 * service account with no project roles (`arcore-client-signer@`). The Functions runtime account
 * holds roles/iam.serviceAccountTokenCreator on that account only, so a leaked ARCore token
 * carries no other permission (scripts/google-cloud-setup.command, docs/FIREBASE_SETUP.md).
 */
const TOKENS_PER_HOUR = 30;
const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
async function runtimeServiceAccountEmail(): Promise<string> {
  const email = process.env.ARCORE_SIGNER_EMAIL;
  if (!email) throw new Error('dedicated_signer_missing');
  return email;
}

async function signJwt(email: string, payload: object): Promise<string> {
  const client = await googleAuth.getClient();
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signJwt`;
  const response = await client.request<{ signedJwt: string }>({ url, method: 'POST', data: { payload: JSON.stringify(payload) } });
  return response.data.signedJwt;
}

export const getArcoreToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async (request) => {
  const caller = requireCaller(request);
  await assertServiceEnabled('arcore_token');
  const now = Date.now();
  const quotaRef = db.collection('arcore_token_quota').doc(tokenQuotaDocId(caller.luid, now));
  const allowed = await db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, caller.luid);
    const snap = await tx.get(quotaRef);
    const count = Number(snap.data()?.count ?? 0);
    if (count >= TOKENS_PER_HOUR) return false;
    tx.set(quotaRef, {
      owner_luid: caller.luid,
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
    // expiresIn (seconds) lets the app compute expiry on its own clock; expiresAt stays for old builds.
    return { token, expiresAt: new Date(claims.exp * 1000).toISOString(), expiresIn: Math.max(0, Math.floor(claims.exp - now / 1000)) };
  } catch (error) {
    logger.error('arcore_token_failed', { code: safeErrorCode(error) });
    // Signing failed (IAM outage): give the slot back so the user is not locked out for an hour.
    await db.runTransaction(async tx => {
      if (await isAccountDeleting(tx, caller.luid)) return;
      const quota = await tx.get(quotaRef);
      if (quota.exists) tx.update(quotaRef, { count: Math.max(0, Number(quota.get('count') ?? 0) - 1) });
    }).catch(() => undefined);
    throw new HttpsError('unavailable', 'ARCore authorization is temporarily unavailable');
  }
});
