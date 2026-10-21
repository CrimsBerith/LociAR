import { onSchedule } from 'firebase-functions/v2/scheduler';
import { forEachSequential } from './async';
import { logger, safeErrorCode } from './core';
import { retryPendingAccountDeletions } from './accountDeletion';
import { drainAvatarDeletions } from './avatar';
import { cleanupPostMedia, purgeDueRemovedMedia, reconcilePostCounters } from './cleanup';
import { expireDueNotes, reconcileNoteDensity } from './noteDensity';

/**
 * All periodic work runs from these three Cloud Scheduler jobs: each billing account gets three jobs
 * free, every further job costs $0.10 per 31 days (https://cloud.google.com/scheduler/pricing). With
 * seven jobs, the cost alone tripped a ₺10 spend cap on 20 Oct 2026 and paused every function.
 * Add new periodic work as a task of one of these jobs, never as a new onSchedule export
 * (scripts/test/firebase_readiness_test.py fails on a fourth schedule).
 */
export const MAX_SCHEDULER_JOBS = 3;

export type ScheduledTask = { name: string; run: () => Promise<unknown> };

/**
 * Runs every task of a job even when one fails. Each failure is logged under its task name and the job
 * fails at the end, so the Scheduler run shows the error while the other tasks still did their work.
 * `parallel` keeps short and long tasks inside one tick; `sequential` keeps nightly passes apart.
 */
export async function runScheduledTasks(job: string, tasks: readonly ScheduledTask[], order: 'parallel' | 'sequential'): Promise<void> {
  const failed: string[] = [];
  const attempt = async (task: ScheduledTask) => {
    try {
      await task.run();
    } catch (error) {
      failed.push(task.name);
      logger.error('scheduled_task_failed', { job, task: task.name, code: safeErrorCode(error) });
    }
  };
  if (order === 'parallel') await Promise.all(tasks.map(attempt));
  else await forEachSequential(tasks, attempt);
  if (failed.length) throw new Error(`${job}: ${failed.sort((a, b) => a.localeCompare(b)).join(', ')} failed`);
}

export const FREQUENT_TASKS: readonly ScheduledTask[] = [
  // Bounded avatar object deletions (at most 100 jobs per run).
  { name: 'avatar_deletions', run: () => drainAvatarDeletions() },
  // Accepted account deletions resume independently of the deleted user's session (240 s budget per job).
  { name: 'account_deletions', run: () => retryPendingAccountDeletions(Date.now(), 2) },
];

export const QUARTER_HOUR_TASKS: readonly ScheduledTask[] = [
  // Resume partial or abandoned media purges without waiting for the nightly pass.
  { name: 'removed_media', run: () => purgeDueRemovedMedia(Date.now(), 20) },
  // Notes with an administrator end date (launch seed retirement removes up to 200 per run).
  { name: 'scheduled_note_ends', run: () => expireDueNotes() },
];

export const NIGHTLY_TASKS: readonly ScheduledTask[] = [
  { name: 'post_media_cleanup', run: () => cleanupPostMedia() },
  { name: 'post_counters', run: () => reconcilePostCounters() },
  { name: 'note_density', run: () => reconcileNoteDensity() },
];

export const everyFiveMinutes = onSchedule({ schedule: 'every 5 minutes', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  await runScheduledTasks('every_five_minutes', FREQUENT_TASKS, 'parallel');
});

export const everyFifteenMinutes = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Europe/Istanbul', timeoutSeconds: 540, maxInstances: 1 }, async () => {
  await runScheduledTasks('every_fifteen_minutes', QUARTER_HOUR_TASKS, 'parallel');
});

// Each nightly pass was a separate 540 s job; run one after another, they get the 1,800 s scheduled-function maximum.
export const nightlyMaintenance = onSchedule({ schedule: 'every day 03:17', timeZone: 'Europe/Istanbul', timeoutSeconds: 1800, memory: '512MiB', maxInstances: 1 }, async () => {
  await runScheduledTasks('nightly_maintenance', NIGHTLY_TASKS, 'sequential');
});
