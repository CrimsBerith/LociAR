import { db, FieldValue, Timestamp } from './core';
import { clampedNext } from './limits';

export type CounterChange = { path: string; changes: Record<string, number> };

/**
 * Applies counter deltas exactly once per trigger event. Firestore triggers are delivered at
 * least once, so the receipt `trigger_receipts/{eventId}` is created in the same transaction as
 * the update (TTL policy on expires_at removes it after 7 days). Missing target documents are
 * skipped and counters never drop below zero. Returns false for a redelivered event.
 */
export async function applyCountersOnce(eventId: string, updates: CounterChange[]): Promise<boolean> {
  const receiptRef = db.collection('trigger_receipts').doc(eventId);
  return db.runTransaction(async (tx) => {
    const [receipt, ...targets] = await Promise.all([tx.get(receiptRef), ...updates.map((u) => tx.get(db.doc(u.path)))]);
    if (receipt.exists) return false;
    targets.forEach((snap, i) => {
      if (!snap.exists) return;
      const data = snap.data()!;
      const next: Record<string, number> = {};
      for (const [field, delta] of Object.entries(updates[i].changes)) next[field] = clampedNext(data[field], delta);
      tx.update(snap.ref, next);
    });
    tx.create(receiptRef, { created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    return true;
  });
}
