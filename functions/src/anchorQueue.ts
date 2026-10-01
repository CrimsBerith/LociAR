import { db, FieldValue, Timestamp } from './core';
import { deleteCloudAnchorDetailed, type ManagementDeps } from './arcoreManagement';

/**
 * Durable retry queue for Cloud Anchor deletions: `cloud_anchor_deletions/{anchorId}`
 * = { attempts, last_error, next_at }. Anchors live 365 days on Google's side, so a failed
 * delete (403, 5xx, API off) must not be forgotten (Guideline 5.1.1(v) / KVKK deletion promise).
 * cleanupPostMedia drains it with exponential backoff.
 */
export const anchorDeletionRef = (id: string) => db.collection('cloud_anchor_deletions').doc(id);

/** 1 h, 2 h, 4 h … capped at 24 h. */
export function backoffMs(attempts: number): number {
  return Math.min(24, 2 ** Math.max(0, attempts)) * 3_600_000;
}

const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/** Deletes now; on failure queues a retry. Returns true when the anchor is gone. */
export async function deleteAnchorOrQueue(anchorId: string | null | undefined, deps: ManagementDeps = {}): Promise<boolean> {
  if (!anchorId) return false;
  const outcome = await deleteCloudAnchorDetailed(anchorId, deps);
  if (outcome.ok) return true;
  if (outcome.skipped && inEmulator()) return false; // emulator: API intentionally off, nothing to retry
  await anchorDeletionRef(anchorId).set({
    attempts: 0,
    last_error: outcome.error ?? 'unknown',
    next_at: Timestamp.now(),
    created_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  return false;
}

/** Retries due entries. Returns how many anchors were deleted. */
export async function drainAnchorDeletionQueue(now = Date.now(), limit = 100, deps: ManagementDeps = {}): Promise<number> {
  const due = await db.collection('cloud_anchor_deletions')
    .where('next_at', '<=', Timestamp.fromMillis(now))
    .orderBy('next_at')
    .limit(limit)
    .get();
  let deleted = 0;
  for (const entry of due.docs) {
    const outcome = await deleteCloudAnchorDetailed(entry.id, deps);
    if (outcome.ok) {
      await entry.ref.delete();
      deleted++;
    } else {
      const attempts = Number(entry.data().attempts ?? 0) + 1;
      await entry.ref.update({
        attempts,
        last_error: outcome.error ?? 'unknown',
        next_at: Timestamp.fromMillis(now + backoffMs(attempts)),
      });
    }
  }
  return deleted;
}
