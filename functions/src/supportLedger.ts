import { db, FieldValue, isUUID, Timestamp } from './core';
import { supportBalanceTotal, supportSplit, refundableWriterAmount, type SupportProvider, type SupportEnvironment } from './supportPolicy';
import { accountDeletionRef } from './profileGuard';

export type SupportPayment = {
  id: string; intentId: string; provider: SupportProvider; environment: SupportEnvironment;
  productId: string; grossMilliunits: number; currency: string; purchasedAt: number;
};

/** Both providers share one atomic, replay-safe ledger. Nothing here is publicly readable. */
export async function creditSupport(payment: SupportPayment, buyer?: string) {
  if (!/^[a-zA-Z0-9_]{1,128}$/.test(payment.id) || !isUUID(payment.intentId)
      || !/^[A-Z]{3}$/.test(payment.currency) || !Number.isSafeInteger(payment.purchasedAt)
      || payment.purchasedAt <= 0 || payment.purchasedAt > Date.now() + 60_000) throw new Error('Invalid payment');
  const split = supportSplit(payment.grossMilliunits);
  return db.runTransaction(async tx => {
    const paymentRef = db.collection('support_payments').doc(payment.id);
    const intentRef = db.collection('support_intents').doc(payment.intentId);
    const [existing, intent, reversal] = await tx.getAll(paymentRef, intentRef,
      db.collection('support_reversals').doc(payment.id));
    if (!intent.exists || (buyer && intent.get('buyer_luid') !== buyer)
        || intent.get('provider') !== payment.provider || intent.get('product_id') !== payment.productId
        || intent.get('environment') !== payment.environment
        || payment.purchasedAt < intent.get('created_at').toMillis() - 60_000) throw new Error('Invalid support intent');
    if (existing.exists) {
      if (existing.get('intent_id') !== payment.intentId || existing.get('gross_milliunits') !== payment.grossMilliunits
          || existing.get('currency') !== payment.currency) throw new Error('Transaction already assigned');
      return { status: existing.get('status') as string, writerShareBps: split.writerShareBps, environment: payment.environment };
    }
    if (intent.get('payment_id') && intent.get('payment_id') !== payment.id) throw new Error('Intent already used');
    const author = intent.get('author_luid') as string;
    if (!isUUID(author)) throw new Error('Recipient unavailable; refund reconciliation required');
    const [deletion, profile, buyerDeletion] = await tx.getAll(accountDeletionRef(author), db.collection('profiles').doc(author),
      accountDeletionRef(String(intent.get('buyer_luid') ?? 'deleted')));
    if (deletion.exists || !profile.exists) throw new Error('Recipient unavailable; refund reconciliation required');
    const expected = intent.get('gross_milliunits');
    if (expected != null && (expected !== payment.grossMilliunits || intent.get('currency') !== payment.currency)) {
      throw new Error('Payment amount mismatch');
    }
    const balanceRef = db.collection('support_balances').doc(`${author}_${payment.currency}_${payment.environment}`);
    const balance = await tx.get(balanceRef);
    const refunded = Math.min(payment.grossMilliunits, Number(reversal.get('refunded_milliunits') ?? 0));
    const reversedWriter = refunded ? refundableWriterAmount(payment.grossMilliunits, refunded) : 0;
    const earned = split.writerMilliunits - reversedWriter;
    tx.create(paymentRef, {
      intent_id: payment.intentId, buyer_luid: buyerDeletion.exists ? null : intent.get('buyer_luid') ?? null, author_luid: author,
      provider: payment.provider, environment: payment.environment, product_id: payment.productId,
      currency: payment.currency, gross_milliunits: payment.grossMilliunits, writer_milliunits: split.writerMilliunits,
      remainder_milliunits: split.remainderMilliunits, writer_share_bps: split.writerShareBps,
      refunded_milliunits: refunded, reversed_writer_milliunits: reversedWriter,
      status: refunded === payment.grossMilliunits ? 'refunded' : 'pending', purchased_at: Timestamp.fromMillis(payment.purchasedAt),
      created_at: FieldValue.serverTimestamp(),
    });
    tx.set(balanceRef, { owner_luid: author, currency: payment.currency, environment: payment.environment,
      pending_milliunits: supportBalanceTotal(Number(balance.get('pending_milliunits') ?? 0), earned),
      updated_at: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(intentRef, { payment_id: payment.id, status: 'recorded' });
    // Retain the completed reference for recovery after the app dies before receiving its receipt.
    // A deliberate new checkout may replace it; late fulfillment must never overwrite a newer lock.
    return { status: refunded === payment.grossMilliunits ? 'refunded' : 'pending', writerShareBps: split.writerShareBps, environment: payment.environment };
  });
}

/** Full/partial refunds and disputes may arrive before fulfillment or more than once. */
export async function reverseSupport(paymentId: string, refundedMilliunits: number) {
  if (!Number.isSafeInteger(refundedMilliunits) || refundedMilliunits <= 0) throw new Error('Invalid refund amount');
  await db.runTransaction(async tx => {
    const ref = db.collection('support_payments').doc(paymentId), reversalRef = db.collection('support_reversals').doc(paymentId);
    const [payment, reversal] = await tx.getAll(ref, reversalRef);
    const refunded = Math.max(refundedMilliunits, Number(reversal.get('refunded_milliunits') ?? 0));
    if (payment.exists) {
      const gross = Number(payment.get('gross_milliunits'));
      const capped = Math.min(gross, refunded);
      const reversedWriter = refundableWriterAmount(gross, capped);
      const delta = reversedWriter - Number(payment.get('reversed_writer_milliunits') ?? 0);
      const author = payment.get('author_luid');
      if (isUUID(author)) {
        const balanceRef = db.collection('support_balances').doc(
          `${author}_${payment.get('currency')}_${payment.get('environment')}`);
        const [balance, deletion] = await tx.getAll(balanceRef, accountDeletionRef(author));
        // All new earnings stay pending until externally reconciled. Never silently spend unsettled funds.
        if (!deletion.exists) tx.set(balanceRef, { pending_milliunits: supportBalanceTotal(Number(balance.get('pending_milliunits') ?? 0), -delta),
          updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }
      tx.update(ref, { refunded_milliunits: capped, reversed_writer_milliunits: reversedWriter,
        status: capped === gross ? 'refunded' : 'pending' });
    }
    tx.set(reversalRef, { refunded_milliunits: refunded, updated_at: FieldValue.serverTimestamp() });
  });
}

/** Remove all app identity links while retaining opaque processor records for refund replay safety. */
export async function eraseSupportAccountLinks(luid: string) {
  for (const collection of ['support_intents', 'support_payments']) {
    for (const field of ['buyer_luid', 'author_luid']) {
      for (;;) {
        const page = await db.collection(collection).where(field, '==', luid).limit(200).get();
        if (page.empty) break;
        const batch = db.batch();
        for (const record of page.docs) batch.update(record.ref, { [field]: null });
        await batch.commit();
      }
    }
  }
}
