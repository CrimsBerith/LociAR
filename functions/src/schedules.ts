import { onSchedule } from 'firebase-functions/v2/scheduler';
import { forEachSequential } from './async';
import { logger, safeErrorCode } from './core';
import { MAINTENANCE_TASKS, runMaintenanceTask, type MaintenanceJob } from './maintenance';

/**
 * All periodic work runs from these three Cloud Scheduler jobs: each billing account gets three jobs
 * free, every further job costs $0.10 per 31 days (https://cloud.google.com/scheduler/pricing). With
 * seven jobs, the cost alone tripped a ₺10 spend cap on 20 Oct 2026 and paused every function.
 * Add new periodic work as a task in maintenance.ts, never as a new onSchedule export
 * (scripts/test/firebase_readiness_test.py fails on a fourth schedule). The admin panel shows each
 * task's last run, can run it now and can pause its automatic runs.
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

/** A job's tasks, each recorded in maintenance_runs and skipped while paused or already running. */
function scheduledTasks(job: MaintenanceJob): readonly ScheduledTask[] {
  return MAINTENANCE_TASKS.filter(task => task.job === job)
    .map(task => ({ name: task.name, run: () => runMaintenanceTask(task, { trigger: 'schedule' }) }));
}

export const FREQUENT_TASKS = scheduledTasks('every_five_minutes');
export const QUARTER_HOUR_TASKS = scheduledTasks('every_fifteen_minutes');
export const NIGHTLY_TASKS = scheduledTasks('nightly_maintenance');

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
