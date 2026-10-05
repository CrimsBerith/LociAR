import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { appleConfigFromEnv, revokeAppleAuthorization } from './apple';
import { reasonError, withContentionGuard } from './errors';
import { isRecentAuth } from './limits';
import { CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, HttpsError, requireCaller } from './core';
import { accountDeletionRef } from './profileGuard';
import { acceptAccountDeletion, retryPendingAccountDeletions, runAccountDeletion } from './accountDeletion';

/** .p8 contents; Secret Manager. No deletion state is accepted before Apple revocation succeeds. */
const APPLE_PRIVATE_KEY = defineSecret('APPLE_PRIVATE_KEY');

export const deleteAccount = onCall({ timeoutSeconds: 300, memory: '512MiB', enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, secrets: [APPLE_PRIVATE_KEY] }, async request => {
  const caller = requireCaller(request);
  const expectedUser = (request.data as { userId?: unknown } | null)?.userId;
  if (expectedUser !== undefined && expectedUser !== caller.luid) {
    throw reasonError('permission-denied', 'Account deletion session changed', 'session_changed');
  }
  if (!isRecentAuth(request.auth?.token?.auth_time, Date.now())) {
    throw reasonError('failed-precondition', 'Recent sign-in required', 'reauth_required');
  }
  // Retries resume an already accepted revocation; Apple's one-use code is not reused.
  const accepted = await accountDeletionRef(caller.luid).get();
  if (!accepted.exists && caller.isAppleUser) {
    const code = (request.data as { appleAuthorizationCode?: unknown } | null)?.appleAuthorizationCode;
    const config = appleConfigFromEnv();
    if (!config) throw reasonError('failed-precondition', 'Apple token revocation is not configured', 'apple_revoke_unavailable');
    if (typeof code !== 'string' || !code) throw reasonError('failed-precondition', 'Apple token revocation is required', 'apple_revoke_failed');
    try { await revokeAppleAuthorization(config, code); }
    catch { throw reasonError('failed-precondition', 'Apple token revocation failed', 'apple_revoke_failed'); }
  }
  await withContentionGuard(() => acceptAccountDeletion(caller));
  try {
    const result = await runAccountDeletion(caller.luid);
    if (result !== 'done') throw reasonError('unavailable', 'Account deletion is accepted and will resume automatically', 'deletion_pending');
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('account_deletion_deferred');
    throw reasonError('unavailable', 'Account deletion is accepted and will resume automatically', 'deletion_pending');
  }
});

/** Runs independently of the deleted user's login/profile, including after worker termination. */
export const retryAccountDeletions = onSchedule({ schedule: 'every 5 minutes', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  await retryPendingAccountDeletions(Date.now(), 2);
});
