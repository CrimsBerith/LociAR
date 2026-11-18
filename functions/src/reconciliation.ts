import { db, FieldValue } from './core';
import { readCounterUpdate, type CounterField } from './counters';

const RECONCILE_CONCURRENCY = 10;

/** Persisted cursors reach every row over successive runs, independent of document ID shape. */
async function reconcileCollection(collection: 'posts' | 'profiles', fields: CounterField[], sampleSize: number): Promise<number> {
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 500) throw new RangeError('sampleSize must be between 1 and 500');
  const cursorRef = db.collection('system').doc(`counter_reconciliation_${collection}`);
  const cursor = (await cursorRef.get()).get('last_id');
  let query = db.collection(collection).orderBy('__name__').limit(sampleSize);
  if (typeof cursor === 'string' && cursor) query = query.startAfter(cursor);
  const page = await query.get();
  let repaired = 0;
  const reconcile = (listed: FirebaseFirestore.QueryDocumentSnapshot) => db.runTransaction(async (tx) => {
    const target = await tx.get(listed.ref);
    const next = await readCounterUpdate(tx, target, fields);
    const fix = Object.fromEntries(Object.entries(next).filter(([field, value]) => target.get(field) !== value));
    if (Object.keys(fix).length === 0) return false;
    tx.update(target.ref, fix);
    return true;
  });
  // Different documents never contend: a few transactions at a time instead of one after another.
  for (let start = 0; start < page.docs.length; start += RECONCILE_CONCURRENCY) {
    const settled = await Promise.allSettled(page.docs.slice(start, start + RECONCILE_CONCURRENCY).map(reconcile));
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
    repaired += settled.filter(result => result.status === 'fulfilled' && result.value).length;
  }
  // Advance only after the entire page succeeds; a failed page is safely retried.
  await cursorRef.set({ last_id: page.size < sampleSize ? null : page.docs[page.size - 1].id, updated_at: FieldValue.serverTimestamp() });
  return repaired;
}

export const reconcileCounters = (sampleSize = 100): Promise<number> => reconcileCollection('posts', ['likes_count', 'comments_count', 'saves_count'], sampleSize);
export const reconcileProfileCounters = (sampleSize = 100): Promise<number> => reconcileCollection('profiles', ['follower_count', 'following_count', 'public_post_count'], sampleSize);
