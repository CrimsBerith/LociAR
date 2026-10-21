import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, isoOrNull } from './firebase-admin';
import { checkReceipt, ConflictError, mutationHash, requireActorAccountActive, writeAudit } from './ops';
import { ValidationError } from './validation';

/**
 * Periodic maintenance tasks of the backend (functions/src/maintenance.ts runs them; names and order must
 * match, see tests/maintenance.test.mjs). The panel shows each task's last run and backlog, queues a
 * "run now" request (`maintenance_requests`, run by the onMaintenanceRequested trigger) and pauses or
 * resumes a task's automatic runs (`system/maintenance.paused`). Account deletion retries cannot be paused:
 * Apple requires an accepted deletion to complete (guideline 5.1.1(v)).
 */
export const MAINTENANCE_TASKS = [
  { name: 'avatar_deletions', label: 'Profile photo deletions', schedule: 'Every 5 minutes', pausable: true,
    description: 'Deletes profile photo files whose deletion failed earlier.' },
  { name: 'account_deletions', label: 'Account deletions', schedule: 'Every 5 minutes', pausable: false,
    description: 'Finishes accepted account deletions that did not complete in one go.' },
  { name: 'removed_media', label: 'Removed post media', schedule: 'Every 15 minutes', pausable: true,
    description: 'Deletes the media of removed posts once their 30-day restore window has passed.' },
  { name: 'scheduled_note_ends', label: 'Note end dates', schedule: 'Every 15 minutes', pausable: true,
    description: 'Removes notes whose administrator end date has passed (up to 200 per run).' },
  { name: 'post_media_cleanup', label: 'Nightly storage cleanup', schedule: 'Every night 03:17', pausable: true,
    description: 'Orphan uploads, unscreened profile photos and Cloud Anchors nothing uses any more.' },
  { name: 'post_counters', label: 'Counter repair', schedule: 'Every night 03:17', pausable: true,
    description: 'Repairs like, comment, save and follower counts on posts and profiles.' },
  { name: 'note_density', label: 'Map density repair', schedule: 'Every night 03:17', pausable: true,
    description: 'Recounts the map heat layer and note spots, 500 posts per night.' },
] as const;

export type MaintenanceTaskName = (typeof MAINTENANCE_TASKS)[number]['name'];
const OPEN_REQUEST_MS = 15 * 60_000;

function taskOf(name: unknown) {
  const task = MAINTENANCE_TASKS.find(item => item.name === name);
  if (!task) throw new ValidationError('invalid_maintenance_task');
  return task;
}

const numbers = (value: unknown): Record<string, number> => value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'number' && Number.isFinite(item)))
  : {};

/** Work waiting right now, per task; nightly passes walk everything with a cursor and have no backlog. */
async function backlog(now: Timestamp): Promise<Partial<Record<MaintenanceTaskName, number | null>>> {
  const db = adminDb();
  const due = async (collection: string, field: string) => {
    try { return (await db.collection(collection).where(field, '<=', now).count().get()).data().count; } catch { return null; }
  };
  const [avatars, accounts, media, notes] = await Promise.all([
    due('avatar_deletions', 'next_at'), due('account_deletion_jobs', 'next_at'), due('media_purge_queue', 'due_at'), due('posts', 'ends_at'),
  ]);
  return { avatar_deletions: avatars, account_deletions: accounts, removed_media: media, scheduled_note_ends: notes };
}

export async function readMaintenanceOverview(nowMs = Date.now()) {
  const db = adminDb();
  const now = Timestamp.fromMillis(nowMs);
  const [runs, settings, requests, waiting] = await Promise.all([
    db.getAll(...MAINTENANCE_TASKS.map(task => db.collection('maintenance_runs').doc(task.name))),
    db.collection('system').doc('maintenance').get(),
    db.collection('maintenance_requests').orderBy('created_at', 'desc').limit(10).get(),
    backlog(now),
  ]);
  const tasks = MAINTENANCE_TASKS.map((task, index) => {
    const run = runs[index].data() ?? {};
    const until = run.running_until;
    return {
      ...task,
      paused: task.pausable && settings.get(`paused.${task.name}`) === true,
      running: until instanceof Timestamp && until.toMillis() > nowMs,
      backlog: waiting[task.name] ?? null,
      lastStatus: typeof run.last_status === 'string' ? run.last_status : null,
      lastCode: typeof run.last_code === 'string' ? run.last_code : null,
      lastFinishedAt: isoOrNull(run.last_finished_at),
      lastSuccessAt: isoOrNull(run.last_success_at),
      lastTrigger: typeof run.last_trigger === 'string' ? run.last_trigger : null,
      lastDurationMs: typeof run.last_duration_ms === 'number' ? run.last_duration_ms : null,
      lastResult: numbers(run.last_result),
      consecutiveFailures: typeof run.consecutive_failures === 'number' ? run.consecutive_failures : 0,
    };
  });
  return {
    tasks,
    requests: requests.docs.map(doc => ({
      id: doc.id,
      task: String(doc.get('task') ?? ''),
      status: String(doc.get('status') ?? ''),
      code: typeof doc.get('code') === 'string' ? doc.get('code') as string : null,
      createdAt: isoOrNull(doc.get('created_at')),
      finishedAt: isoOrNull(doc.get('finished_at')),
      result: numbers(doc.get('result')),
    })),
  };
}

/** Queues one "run now" request with its audit receipt; a second request waits until the first ends. */
export async function requestMaintenanceRun(name: unknown, actorId: string, reason: string, idempotencyKey: string) {
  const task = taskOf(name);
  const db = adminDb();
  const hash = mutationHash(actorId, 'maintenance_run', task.name, { reason });
  return await db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const [audit, open] = await Promise.all([
      tx.get(db.collection('admin_audit_log').doc(idempotencyKey)),
      tx.get(db.collection('maintenance_requests').where('task', '==', task.name).where('status', 'in', ['queued', 'running']).limit(5)),
    ]);
    if (checkReceipt(audit, hash)) return audit.get('after_state');
    const cutoff = Date.now() - OPEN_REQUEST_MS;
    if (open.docs.some(doc => ((doc.get('created_at') as Timestamp | undefined)?.toMillis?.() ?? 0) > cutoff)) {
      throw new ConflictError('maintenance_task_busy');
    }
    const after = { task: task.name, status: 'queued' };
    tx.create(db.collection('maintenance_requests').doc(idempotencyKey), { ...after, actor_id: actorId, reason, created_at: FieldValue.serverTimestamp() });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: 'maintenance_run_requested', resourceType: 'maintenance_task',
      resourceId: task.name, after, reason, permissionKey: 'system.maintenance', riskLevel: 'sensitive' });
    return after;
  });
}

/** Pauses or resumes a task's automatic runs; "run now" keeps working while paused. */
export async function setMaintenancePaused(name: unknown, paused: boolean, actorId: string, reason: string, idempotencyKey: string) {
  const task = taskOf(name);
  if (!task.pausable) throw new ConflictError('maintenance_task_not_pausable');
  const db = adminDb();
  const ref = db.collection('system').doc('maintenance');
  const hash = mutationHash(actorId, 'maintenance_pause', task.name, { paused, reason });
  return await db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actorId);
    const [audit, before] = await Promise.all([tx.get(db.collection('admin_audit_log').doc(idempotencyKey)), tx.get(ref)]);
    if (checkReceipt(audit, hash)) return audit.get('after_state');
    const after = { task: task.name, paused };
    tx.set(ref, { paused: { [task.name]: paused }, updated_by: actorId, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    writeAudit(tx, idempotencyKey, { requestHash: hash, actorId, action: paused ? 'maintenance_paused' : 'maintenance_resumed',
      resourceType: 'maintenance_task', resourceId: task.name, before: { paused: before.get(`paused.${task.name}`) === true }, after,
      reason, permissionKey: 'system.maintenance', riskLevel: 'sensitive' });
    return after;
  });
}
