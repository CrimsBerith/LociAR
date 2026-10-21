import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createRequire } from 'node:module';
process.env.GCLOUD_PROJECT = 'demo-lociar';
// lib/core.js reads the CommonJS logger through getters, so its methods can be mocked here.
const logger = createRequire(import.meta.url)('firebase-functions/logger');
const { runScheduledTasks, MAX_SCHEDULER_JOBS, FREQUENT_TASKS, QUARTER_HOUR_TASKS, NIGHTLY_TASKS } = await import('../lib/schedules.js');
const functions = await import('../lib/index.js');

test('a failing task is logged by name, never stops the other tasks and fails the job at the end', async t => {
  const logged = [];
  t.mock.method(logger, 'error', (...args) => { logged.push(JSON.stringify(args)); });
  const ran = [];
  const tasks = [
    { name: 'slow', run: async () => { await setImmediate(); ran.push('slow'); } },
    { name: 'broken', run: async () => { ran.push('broken'); throw new Error('provider detail with a secret token'); } },
    { name: 'quick', run: async () => { ran.push('quick'); } },
  ];
  await assert.rejects(runScheduledTasks('test_job', tasks, 'parallel'), /^Error: test_job: broken failed$/);
  assert.deepEqual([...ran].sort((a, b) => a.localeCompare(b)), ['broken', 'quick', 'slow']);
  assert.equal(logged.filter(line => line.includes('scheduled_task_failed') && line.includes('broken')).length, 1);
  assert.ok(logged.every(line => !line.includes('secret token')), 'only a safe error code is logged');
});

test('sequential jobs run in order without overlap and keep going after a failure', async t => {
  t.mock.method(logger, 'error', () => {});
  const events = [];
  let active = false;
  const step = (name, fail = false) => ({ name, run: async () => {
    assert.equal(active, false, 'nightly passes must not overlap');
    active = true;
    events.push(name);
    await setImmediate();
    active = false;
    if (fail) throw new Error('boom');
  } });
  await assert.rejects(runScheduledTasks('nightly', [step('first', true), step('second'), step('third', true)], 'sequential'),
    /nightly: first, third failed/);
  assert.deepEqual(events, ['first', 'second', 'third']);
  await runScheduledTasks('nightly', [step('only')], 'sequential');
});

test('every periodic task runs from at most three Cloud Scheduler jobs (the free tier)', () => {
  const scheduled = Object.entries(functions).filter(([, fn]) => fn?.__endpoint?.scheduleTrigger);
  assert.ok(scheduled.length <= MAX_SCHEDULER_JOBS, `${scheduled.length} scheduled functions: ${scheduled.map(([name]) => name).join(', ')}`);
  assert.deepEqual(Object.fromEntries(scheduled.map(([name, fn]) => [name, fn.__endpoint.scheduleTrigger.schedule])), {
    everyFiveMinutes: 'every 5 minutes', everyFifteenMinutes: 'every 15 minutes', nightlyMaintenance: 'every day 03:17',
  });
  assert.equal(functions.nightlyMaintenance.__endpoint.timeoutSeconds, 1800, 'the nightly passes run one after another');
  for (const name of ['retryAccountDeletions', 'retryAvatarDeletions', 'retryRemovedMedia', 'expireScheduledNotes',
    'cleanupPostMedia', 'reconcilePostCounters', 'reconcileNoteDensity']) assert.equal(functions[name], undefined, `${name} is a task now`);
  const names = [...FREQUENT_TASKS, ...QUARTER_HOUR_TASKS, ...NIGHTLY_TASKS].map(task => task.name);
  assert.deepEqual(names, ['avatar_deletions', 'account_deletions', 'removed_media', 'scheduled_note_ends',
    'post_media_cleanup', 'post_counters', 'note_density', 'map_cells']);
});
