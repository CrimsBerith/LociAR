import { onCall } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, HttpsError, requireCaller, Timestamp } from './core';
import { assertAccountNotDeleting } from './profileGuard';

/** Marks only the caller's loaded/tapped activity. Existing read times remain unchanged. */
export const markActivityRead = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES }, async request => {
  const caller = requireCaller(request);
  const data = request.data as { userId?: unknown; activityIds?: unknown } | null;
  // A request queued before an Auth switch cannot write under the next session.
  if (data?.userId !== caller.luid) throw new HttpsError('permission-denied', 'Activity session changed');
  if (!Array.isArray(data.activityIds) || data.activityIds.length < 1 || data.activityIds.length > 50
    || data.activityIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id))) {
    throw new HttpsError('invalid-argument', 'Between 1 and 50 valid activity IDs required');
  }
  const ids = [...new Set(data.activityIds as string[])];
  return db.runTransaction(async tx => {
    await assertAccountNotDeleting(tx, caller.luid);
    const snapshots = await Promise.all(ids.map(id => activityForCaller(tx, id)));
    const now = Timestamp.now();
    const activities: Array<{ id: string; readAt: string }> = [];
    for (const [index, snap] of snapshots.entries()) {
      // A foreign row and a missing row look the same: omitted, no error.
      if (!snap?.exists || snap.get('recipient_id') !== caller.luid) continue;
      const previous = snap.get('read_at');
      const readAt = previous instanceof Timestamp ? previous : now;
      if (!(previous instanceof Timestamp)) tx.update(snap.ref, { read_at: readAt });
      activities.push({ id: ids[index], readAt: readAt.toDate().toISOString() });
    }
    return { activities };
  });
});

/** Direct id, or the act_ id stored on an older predictable document. */
async function activityForCaller(tx: FirebaseFirestore.Transaction, id: string) {
  const direct = await tx.get(db.collection('activity_events').doc(id));
  if (direct.exists || !id.startsWith('act_')) return direct;
  const found = await tx.get(db.collection('activity_events').where('public_ref', '==', id).limit(1));
  return found.docs[0] ?? direct;
}
