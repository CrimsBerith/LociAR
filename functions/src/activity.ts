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
    const snapshots = await tx.getAll(...ids.map(id => db.collection('activity_events').doc(id)));
    // Validate the entire batch before writing anything. Deleted/expired rows are a no-op.
    if (snapshots.some(snap => snap.exists && snap.get('recipient_id') !== caller.luid)) {
      throw new HttpsError('permission-denied', 'Activity belongs to another recipient');
    }
    const now = Timestamp.now();
    const activities: Array<{ id: string; readAt: string }> = [];
    for (const snap of snapshots) {
      if (!snap.exists) continue;
      const previous = snap.get('read_at');
      const readAt = previous instanceof Timestamp ? previous : now;
      if (!(previous instanceof Timestamp)) tx.update(snap.ref, { read_at: readAt });
      activities.push({ id: snap.id, readAt: readAt.toDate().toISOString() });
    }
    return { activities };
  });
});
