import { randomUUID } from 'node:crypto';
import { db, FieldValue, HttpsError, isUUID, Timestamp, type Caller, identityVerified } from './core';
import { requireActiveAccount } from './profileGuard';
import { isPublicActive } from './counters';
import { contentBlocked } from './anonymousAccess';
import { hasPostReport } from './postReports';
import { bumpWindow } from './limits';
import { supportProduct, type SupportSettings, type SupportProvider } from './supportPolicy';

export type SupportQuote = { gross_milliunits: number; currency: string; stripe_price_id?: string; crypto_processor?: string };
export const supportLockRef = (buyer: string, post: string, environment: string) =>
  db.collection('support_checkout_locks').doc(`${buyer}_${post}_${environment}`);

export async function createSupportIntent(caller: Caller, data: Record<string, unknown>, provider: SupportProvider,
  settings: SupportSettings, quote?: SupportQuote) {
  if (!identityVerified(caller) || caller.isAnonymous) throw new HttpsError('permission-denied', 'Verified account required');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpsError('invalid-argument', 'Invalid support request');
  if (!isUUID(data.postId)) throw new HttpsError('invalid-argument', 'Invalid post');
  if (data.previousIntentId != null && !isUUID(data.previousIntentId)) throw new HttpsError('invalid-argument', 'Invalid previous support reference');
  let productId: string;
  try { productId = supportProduct(data.productId); } catch { throw new HttpsError('invalid-argument', 'Invalid support product'); }
  const postId = data.postId.toLowerCase(), id = randomUUID();
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const post = (await tx.get(db.collection('posts').doc(postId))).data();
    if (!isPublicActive(post) || post?.sponsorship || post?.creator_id === caller.luid
        || await contentBlocked(caller.luid, post!, tx) || await hasPostReport(tx, caller.luid, postId)) {
      throw new HttpsError('permission-denied', 'Content unavailable');
    }
    await requireActiveAccount(tx, String(post!.creator_id));
    // These receipts grant comment/support actions only, never remote note text access.
    if (post!.note_kind === 'location') {
      const grant = await tx.get(db.collection('dense_spot_unlocks').doc(`${caller.luid}_note_${postId}`));
      if (!(grant.get('expires_at') instanceof Timestamp) || grant.get('expires_at').toMillis() <= Date.now()) {
        throw new HttpsError('permission-denied', 'Open the note on site first');
      }
    }
    const lockRef = supportLockRef(caller.luid, postId, settings.environment), lock = await tx.get(lockRef);
    if (lock.exists) {
      const pending = await tx.get(db.collection('support_intents').doc(String(lock.get('intent_id'))));
      if (!pending.exists || pending.get('buyer_luid') !== caller.luid || pending.get('post_id') !== postId
          || pending.get('environment') !== settings.environment) throw new HttpsError('failed-precondition', 'Support reconciliation required');
      // A late retry after fulfillment must also reuse the first checkout. Only a deliberate
      // new donation naming the last settled reference may replace it.
      const repeating = pending.get('payment_id') && String(data.previousIntentId ?? '').toLowerCase() === pending.id;
      if ((!pending.get('payment_id') && pending.get('status') !== 'expired') || (pending.get('payment_id') && !repeating)) {
        if (provider === 'apple' || pending.get('provider') !== provider || pending.get('product_id') !== productId) {
          throw new HttpsError('already-exists', 'Check the pending support payment first');
        }
        return { intentId: pending.id, productId };
      }
    }
    const quotaRef = db.collection('support_quota').doc(caller.luid), quota = await tx.get(quotaRef);
    const window = bumpWindow(quota.get('hour'), Date.now(), 3_600_000, 20);
    if (!window.allowed) throw new HttpsError('resource-exhausted', 'Too many support attempts');
    tx.set(quotaRef, { owner_luid: caller.luid, hour: window.next });
    tx.create(db.collection('support_intents').doc(id), {
      buyer_luid: caller.luid, author_luid: post!.creator_id, post_id: postId, product_id: productId,
      provider, environment: settings.environment, status: 'created',
      created_at: Timestamp.now(), expires_at: Timestamp.fromMillis(Date.now() + 32 * 60_000),
      writer_share_bps: 7200, updated_at: FieldValue.serverTimestamp(),
      ...(quote ?? {}),
    });
    if (provider !== 'apple') tx.set(lockRef, { owner_luid: caller.luid, post_id: postId,
      environment: settings.environment, intent_id: id });
    // No author identifier, payout destination, note body or supporter's identity crosses this boundary.
    return { intentId: id, productId };
  });
}

/** Only an authenticated provider's terminal state may release an unpaid checkout. Never a local timer/redirect. */
export async function expireSupportIntent(id: string) {
  await db.runTransaction(async tx => {
    const ref = db.collection('support_intents').doc(id), intent = await tx.get(ref);
    if (!intent.exists || intent.get('payment_id') || !isUUID(intent.get('buyer_luid'))) return;
    const lockRef = supportLockRef(intent.get('buyer_luid'), intent.get('post_id'), intent.get('environment'));
    const lock = await tx.get(lockRef);
    tx.update(ref, { status: 'expired', updated_at: FieldValue.serverTimestamp() });
    if (lock.get('intent_id') === id) tx.delete(lockRef);
  });
}

/** NOWPayments invoices have no documented create idempotency key. Never retry an uncertain POST. */
export async function claimCryptoInvoiceCreation(id: string): Promise<boolean> {
  return db.runTransaction(async tx => {
    const ref = db.collection('support_intents').doc(id), intent = await tx.get(ref);
    if (!intent.exists || intent.get('crypto_processor') !== 'nowpayments' || intent.get('provider_creation_started')) return false;
    tx.update(ref, { provider_creation_started: true });
    return true;
  });
}

export async function requireSupportRefresh(caller: Caller, id: unknown) {
  if (!isUUID(id)) throw new HttpsError('invalid-argument', 'Invalid support reference');
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const intent = await tx.get(db.collection('support_intents').doc(id.toLowerCase()));
    if (!intent.exists || intent.get('buyer_luid') !== caller.luid) throw new HttpsError('permission-denied', 'Support unavailable');
    const quotaRef = db.collection('support_refresh_quota').doc(caller.luid), quota = await tx.get(quotaRef);
    const window = bumpWindow(quota.get('minute'), Date.now(), 60_000, 10);
    if (!window.allowed) throw new HttpsError('resource-exhausted', 'Wait before checking again');
    tx.set(quotaRef, { owner_luid: caller.luid, minute: window.next });
    return intent;
  });
}
