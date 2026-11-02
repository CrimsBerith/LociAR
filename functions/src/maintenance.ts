import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue, Timestamp, logger, safeErrorCode } from './core';
import { retryPendingAccountDeletions } from './accountDeletion';
import { drainAvatarDeletions } from './avatar';
import { cleanupPostMedia, purgeDueRemovedMedia, reconcilePostCounters } from './cleanup';
import { expireDueNotes, reconcileNoteDensity } from './noteDensity';
import { reconcileMapCells } from './mapCells';

/**
 * Periodic maintenance, run by the three Scheduler jobs (schedules.ts) and on demand from the admin panel
 * (Maintenance page → `maintenance_requests/{id}` → onMaintenanceRequested). Every run of a task, scheduled
 * or manual, records its outcome in `maintenance_runs/{task}` and holds a lease there, so two runs of one
 * task never overlap. Administrators may pause the automatic runs of a pausable task in
 * `system/maintenance.paused`; account deletion retries cannot be paused (App Store guideline 5.1.1(v)).
 * The admin panel lists these task names (admin/lib/maintenance.ts); a test keeps both lists equal.
 */
export type MaintenanceJob = 'every_five_minutes' | 'every_fifteen_minutes' | 'nightly_maintenance';
export type MaintenanceResult = Record<string, number>;
export type MaintenanceTask = {
  name: string;
  job: MaintenanceJob;
  /** Longest a run may take; a crashed run's lease expires after it. */
  leaseMs: number;
  pausable: boolean;
  run: () => Promise<unknown>;
};
export type MaintenanceTrigger = { trigger: 'schedule' | 'admin'; actorId?: string; requestId?: string };
export type MaintenanceOutcome = { status: 'ok' | 'paused' | 'busy'; result?: MaintenanceResult };

const MINUTE = 60_000;

export const MAINTENANCE_TASKS: readonly MaintenanceTask[] = [
  // Bounded avatar object deletions (at most 100 jobs per run).
  { name: 'avatar_deletions', job: 'every_five_minutes', leaseMs: 4 * MINUTE, pausable: true, run: () => drainAvatarDeletions() },
  // Accepted account deletions resume independently of the deleted user's session (240 s budget per job).
  { name: 'account_deletions', job: 'every_five_minutes', leaseMs: 9 * MINUTE, pausable: false, run: () => retryPendingAccountDeletions(Date.now(), 2) },
  // Resume partial or abandoned media purges without waiting for the nightly pass.
  { name: 'removed_media', job: 'every_fifteen_minutes', leaseMs: 9 * MINUTE, pausable: true, run: () => purgeDueRemovedMedia(Date.now(), 20) },
  // Notes with an administrator end date (launch seed retirement removes up to 200 per run).
  { name: 'scheduled_note_ends', job: 'every_fifteen_minutes', leaseMs: 5 * MINUTE, pausable: true, run: () => expireDueNotes() },
  { name: 'post_media_cleanup', job: 'nightly_maintenance', leaseMs: 9 * MINUTE, pausable: true, run: () => cleanupPostMedia() },
  { name: 'post_counters', job: 'nightly_maintenance', leaseMs: 9 * MINUTE, pausable: true, run: () => reconcilePostCounters() },
  { name: 'note_density', job: 'nightly_maintenance', leaseMs: 9 * MINUTE, pausable: true, run: () => reconcileNoteDensity() },
  // Map cell index repair; its first complete pass switches map reads to the index (mapCells.ts).
  { name: 'map_cells', job: 'nightly_maintenance', leaseMs: 15 * MINUTE, pausable: true, run: () => reconcileMapCells() },
];

export const maintenanceTask = (name: unknown) => MAINTENANCE_TASKS.find(task => task.name === name);

/** Numbers only: a run's summary is shown in the panel, never provider data or identifiers. */
export function summarize(value: unknown): MaintenanceResult {
  if (typeof value === 'number' && Number.isFinite(value)) return { count: value };
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => /^\w{1,40}$/.test(key) && typeof item === 'number' && Number.isFinite(item)));
}

/** Claims the task's lease, runs it and records the outcome. Failures are recorded, then rethrown. */
export async function runMaintenanceTask(task: MaintenanceTask, by: MaintenanceTrigger, now = () => Date.now()): Promise<MaintenanceOutcome> {
  const runRef = db.collection('maintenance_runs').doc(task.name);
  const started = now();
  const claim = await db.runTransaction(async tx => {
    const [run, settings] = await tx.getAll(runRef, db.collection('system').doc('maintenance'));
    if (by.trigger === 'schedule' && task.pausable && settings.get(`paused.${task.name}`) === true) {
      tx.set(runRef, { task: task.name, last_skipped_at: FieldValue.serverTimestamp() }, { merge: true });
      return 'paused' as const;
    }
    const until = run.get('running_until');
    if (until instanceof Timestamp && until.toMillis() > started) return 'busy' as const;
    tx.set(runRef, { task: task.name, running_until: Timestamp.fromMillis(started + task.leaseMs), started_at: FieldValue.serverTimestamp(),
      trigger: by.trigger, actor_id: by.actorId ?? null, request_id: by.requestId ?? null }, { merge: true });
    return 'claimed' as const;
  });
  if (claim !== 'claimed') return { status: claim };
  const finished = { running_until: FieldValue.delete(), last_finished_at: FieldValue.serverTimestamp(), last_trigger: by.trigger, last_actor_id: by.actorId ?? null };
  try {
    const result = summarize(await task.run());
    await runRef.set({ ...finished, last_status: 'ok', last_code: null, last_result: result, last_success_at: FieldValue.serverTimestamp(),
      last_duration_ms: Math.max(0, now() - started), consecutive_failures: 0 }, { merge: true });
    return { status: 'ok', result };
  } catch (error) {
    await runRef.set({ ...finished, last_status: 'failed', last_code: safeErrorCode(error), last_duration_ms: Math.max(0, now() - started),
      consecutive_failures: FieldValue.increment(1) }, { merge: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * "Run now" from the admin panel. The panel writes the request with an audit receipt (admin/lib/maintenance.ts);
 * clients cannot write this collection. A redelivered event finds the request no longer queued and does nothing.
 */
export const onMaintenanceRequested = onDocumentCreated({ document: 'maintenance_requests/{requestId}', retry: false, timeoutSeconds: 540, memory: '512MiB', maxInstances: 2 }, async event => {
  const ref = event.data?.ref;
  if (!ref) return;
  const request = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'queued') return null;
    const task = maintenanceTask(snap.get('task'));
    if (!task) { tx.update(ref, { status: 'rejected', code: 'invalid_maintenance_task', finished_at: FieldValue.serverTimestamp() }); return null; }
    tx.update(ref, { status: 'running', started_at: FieldValue.serverTimestamp() });
    return { task, actorId: String(snap.get('actor_id') ?? '') };
  });
  if (!request) return;
  try {
    const outcome = await runMaintenanceTask(request.task, { trigger: 'admin', actorId: request.actorId, requestId: ref.id });
    await ref.update({ status: outcome.status === 'ok' ? 'done' : outcome.status, result: outcome.result ?? null, finished_at: FieldValue.serverTimestamp() });
  } catch (error) {
    const code = safeErrorCode(error);
    logger.error('maintenance_request_failed', { task: request.task.name, code });
    await ref.update({ status: 'failed', code, finished_at: FieldValue.serverTimestamp() });
  }
});
