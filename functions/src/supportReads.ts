import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, HttpsError, isUUID, requireCaller, type Caller } from './core';
import { requireActiveAccount } from './profileGuard';
import { supportLockRef } from './supportAccess';
import { supportSettings } from './supportPolicy';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };
export async function readSupportReceipt(caller: Caller, data: { intentId?: unknown; postId?: unknown }) {
  if (isUUID(data.intentId) === isUUID(data.postId)) throw new HttpsError('invalid-argument', 'Provide one support reference');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const settings = supportSettings((await tx.get(db.collection('system').doc('post_support'))).data());
    let id = data.intentId as string | undefined;
    if (!id) {
      const lock = await tx.get(supportLockRef(caller.luid, String(data.postId).toLowerCase(), settings.environment));
      id = lock.get('intent_id');
      if (!id) return { status: 'none', writerShareBps: 7200, environment: settings.environment };
    }
    if (!isUUID(id)) throw new HttpsError('failed-precondition', 'Support reconciliation required');
    const intent = await tx.get(db.collection('support_intents').doc(id.toLowerCase()));
    if (!intent.exists || intent.get('buyer_luid') !== caller.luid) throw new HttpsError('permission-denied', 'Support unavailable');
    const paymentId = intent.get('payment_id');
    const payment = typeof paymentId === 'string' ? await tx.get(db.collection('support_payments').doc(paymentId)) : null;
    return { status: payment?.get('status') ?? (intent.get('status') === 'expired' ? 'expired' : 'awaiting_payment'),
      writerShareBps: 7200, intentId: intent.id, environment: intent.get('environment'),
      externalIOSAllowed: settings.allowExternalIOS && intent.get('environment') === settings.environment
        && (intent.get('provider') === 'stripe' ? settings.stripeEnabled : settings.cryptoEnabled),
      processor: intent.get('crypto_processor') === 'nowpayments' ? 'nowpayments' : 'stripe',
      ...(typeof intent.get('checkout_url') === 'string' ? { url: intent.get('checkout_url') } : {}) };
  });
}
export const readMyPostSupport = onCall(options, request => readSupportReceipt(requireCaller(request), request.data ?? {}));

export const readMySupportEarnings = onCall(options, async request => {
  const caller = requireCaller(request);
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const balances = await tx.get(db.collection('support_balances').where('owner_luid', '==', caller.luid).limit(100));
    // Never return buyer, note, intent, transaction or author IDs to another account.
    return { writerShareBps: 7200, payoutsAvailable: false, balances: balances.docs.map(doc => ({
      currency: doc.get('currency'), environment: doc.get('environment'),
      pendingMilliunits: doc.get('pending_milliunits') ?? 0,
    })) };
  });
});
