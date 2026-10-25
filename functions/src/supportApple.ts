import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Environment, SignedDataVerifier, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, HttpsError, isUUID, requireCaller } from './core';
import { createSupportIntent } from './supportAccess';
import { creditSupport, reverseSupport } from './supportLedger';
import { loadSupportSettings } from './supportStripe';
import { supportProduct, supportSplit, type SupportSettings } from './supportPolicy';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };
function verifier(settings: SupportSettings) {
  const roots = [readFileSync(join(__dirname, '../certificates/AppleRootCA-G3.cer'))];
  return new SignedDataVerifier(roots, true,
    settings.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX,
    'com.khankartal.lociar', settings.appleId || undefined);
}

export function appleSupportPayment(transaction: JWSTransactionDecodedPayload, settings: SupportSettings) {
  if (transaction.bundleId !== 'com.khankartal.lociar' || transaction.type !== 'Consumable'
      || transaction.inAppOwnershipType !== 'PURCHASED' || !isUUID(transaction.appAccountToken)
      || typeof transaction.transactionId !== 'string' || !/^\d{1,64}$/.test(transaction.transactionId)
      || !Number.isSafeInteger(transaction.purchaseDate) || Number(transaction.purchaseDate) > Date.now() + 60_000
      || !/^[A-Z]{3}$/.test(transaction.currency ?? '')
      || transaction.environment !== (settings.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX)) {
    throw new Error('Invalid Apple support transaction');
  }
  const productId = supportProduct(transaction.productId);
  const split = supportSplit(Number(transaction.price));
  return { id: `apple_${transaction.transactionId}`, intentId: transaction.appAccountToken.toLowerCase(),
    provider: 'apple' as const, environment: settings.environment, productId,
    grossMilliunits: split.grossMilliunits, currency: transaction.currency!, purchasedAt: transaction.purchaseDate! };
}

export const beginApplePostSupport = onCall(options, async request => {
  const settings = await loadSupportSettings();
  if (!settings.appleEnabled) throw new HttpsError('failed-precondition', 'Support payments are not available yet');
  return createSupportIntent(requireCaller(request), request.data as Record<string, unknown>, 'apple', settings);
});

export const confirmApplePostSupport = onCall({ ...options, timeoutSeconds: 60 }, async request => {
  const caller = requireCaller(request), signed = request.data?.signedTransaction;
  if (typeof signed !== 'string' || signed.length > 50_000) throw new HttpsError('invalid-argument', 'Invalid transaction');
  const settings = await loadSupportSettings();
  // Finishing an already paid purchase remains possible when the new-purchase switch is off.
  let transaction: JWSTransactionDecodedPayload;
  try { transaction = await verifier(settings).verifyAndDecodeTransaction(signed); }
  catch { throw new HttpsError('permission-denied', 'Transaction verification failed'); }
  const payment = appleSupportPayment(transaction, settings);
  if (transaction.revocationDate) await reverseSupport(payment.id, payment.grossMilliunits);
  return creditSupport(payment, caller.luid);
});

export const supportAppleNotifications = onRequest({ maxInstances: CALLABLE_MAX_INSTANCES }, async (request, response) => {
  if (request.method !== 'POST') { response.status(405).end(); return; }
  const signed = request.body?.signedPayload;
  if (typeof signed !== 'string' || signed.length > 100_000) { response.status(400).end(); return; }
  const settings = await loadSupportSettings(), check = verifier(settings);
  let notification;
  try { notification = await check.verifyAndDecodeNotification(signed); }
  catch { response.status(400).end(); return; }
  try {
    const payload = notification.data?.signedTransactionInfo;
    if (payload && ['REFUND', 'REVOKE'].includes(String(notification.notificationType))) {
      const transaction = await check.verifyAndDecodeTransaction(payload);
      if (typeof transaction.productId === 'string' && transaction.productId.startsWith('com.khankartal.lociar.support.')) {
        const payment = appleSupportPayment(transaction, settings);
        await reverseSupport(payment.id, payment.grossMilliunits);
      }
    }
    response.status(200).send('OK');
  } catch { response.status(503).send('Retry'); }
});
