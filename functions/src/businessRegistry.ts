import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from './core';

/** A note is tied to an operator-controlled business revision, not just a permanent coordinate. */
export async function businessNoteCurrent(tx: FirebaseFirestore.Transaction, data: FirebaseFirestore.DocumentData | undefined) {
  if (data?.note_kind !== 'business') return true;
  if (data.business_invalidated || typeof data.business_id !== 'string') return false;
  const venue = await tx.get(db.collection('business_places').doc(data.business_id));
  return venue.exists && venue.get('status') === 'active' && venue.get('revision') === data.business_note?.revision;
}

export async function invalidateBusinessNotes(id: string) {
  for (let page = 0; page < 20; page++) {
    const venue = await db.collection('business_places').doc(id).get();
    if (!venue.exists) return;
    const revision = venue.get('revision');
    const notes = await db.collection('posts').where('business_id', '==', id).where('business_note.revision', '<', revision)
      .where('status', 'in', ['active', 'pending_review']).limit(200).get();
    if (notes.empty) return;
    await db.runTransaction(async tx => {
      const current = await tx.get(venue.ref), fresh = await tx.getAll(...notes.docs.map(p => p.ref));
      for (const p of fresh) if (p.exists && !p.get('deleted_at') && ['active', 'pending_review'].includes(p.get('status')) && p.get('business_note.revision') < current.get('revision')) {
        tx.update(p.ref, { status: 'flagged', business_invalidated: true, business_invalidated_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
      }
    });
  }
  // Successfully flagged pages leave the query. A retry resumes without repeating them.
  throw new Error('business_invalidation_needs_retry');
}

export const onBusinessChanged = onDocumentUpdated({ document: 'business_places/{businessId}', retry: true, timeoutSeconds: 540, maxInstances: 5 }, async event => {
  if (!event.data || event.data.before.get('revision') === event.data.after.get('revision')) return;
  await invalidateBusinessNotes(event.params.businessId);
});
