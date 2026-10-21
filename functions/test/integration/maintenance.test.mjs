import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients } from './_harness.mjs';
const { runMaintenanceTask, summarize, MAINTENANCE_TASKS } = await import('../../lib/maintenance.js');

after(closeClients);
const runs = name => adminDb.collection('maintenance_runs').doc(name);
const settings = adminDb.collection('system').doc('maintenance');

async function until(read, done, label) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (done(value)) return value;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

test('a maintenance run records its outcome, holds a lease, honours pause and records failures', async () => {
  const name = `test_${randomUUID().slice(0, 8)}`;
  let calls = 0;
  const task = { name, job: 'every_five_minutes', leaseMs: 60_000, pausable: true, run: async () => { calls++; return { removed: 3, secret: 'ignored' }; } };

  assert.deepEqual(await runMaintenanceTask(task, { trigger: 'schedule' }), { status: 'ok', result: { removed: 3 } });
  let run = (await runs(name).get()).data();
  assert.equal(run.last_status, 'ok');
  assert.equal(run.last_trigger, 'schedule');
  assert.deepEqual(run.last_result, { removed: 3 }, 'only numbers reach the panel');
  assert.equal(run.running_until, undefined, 'the lease is released');

  await runs(name).update({ running_until: Timestamp.fromMillis(Date.now() + 60_000) });
  assert.deepEqual(await runMaintenanceTask(task, { trigger: 'admin', actorId: 'admin-1' }), { status: 'busy' });
  assert.equal(calls, 1, 'a running task never runs twice at once');
  await runs(name).update({ running_until: FieldValue.delete() });

  await settings.set({ paused: { [name]: true } }, { merge: true });
  assert.deepEqual(await runMaintenanceTask(task, { trigger: 'schedule' }), { status: 'paused' });
  assert.equal(calls, 1, 'paused automatic runs are skipped');
  assert.equal((await runMaintenanceTask(task, { trigger: 'admin', actorId: 'admin-1' })).status, 'ok', 'an administrator can still run it');
  assert.equal(calls, 2);
  assert.equal((await runs(name).get()).get('last_actor_id'), 'admin-1');

  const steady = { ...task, pausable: false };
  assert.equal((await runMaintenanceTask(steady, { trigger: 'schedule' })).status, 'ok', 'a task that cannot be paused ignores the flag');
  await settings.update({ [`paused.${name}`]: FieldValue.delete() });

  const broken = { ...task, run: async () => { throw Object.assign(new Error('provider detail'), { code: 'unavailable' }); } };
  await assert.rejects(runMaintenanceTask(broken, { trigger: 'schedule' }), /provider detail/);
  await assert.rejects(runMaintenanceTask(broken, { trigger: 'schedule' }), /provider detail/);
  run = (await runs(name).get()).data();
  assert.equal(run.last_status, 'failed');
  assert.equal(run.last_code, 'unavailable');
  assert.equal(run.consecutive_failures, 2);
  assert.equal(run.running_until, undefined, 'a failed run releases the lease');
  assert.equal(JSON.stringify(run).includes('provider detail'), false);
  assert.deepEqual(summarize(7), { count: 7 });
  assert.deepEqual(summarize(undefined), {});
});

test('"Run now" from the admin panel runs the task once and reports back on the request', async () => {
  assert.ok(MAINTENANCE_TASKS.some(task => task.name === 'scheduled_note_ends'));
  const post = adminDb.collection('posts').doc(randomUUID());
  await post.set({ creator_id: randomUUID(), status: 'active', visibility: 'public', age_rating: 'all', lat: 41, lng: 29,
    ends_at: Timestamp.fromMillis(Date.now() - 1000), created_at: Timestamp.now() });
  const request = adminDb.collection('maintenance_requests').doc(randomUUID());
  await request.set({ task: 'scheduled_note_ends', status: 'queued', actor_id: 'admin-run-now', reason: 'Integration check', created_at: Timestamp.now() });
  const done = await until(async () => (await request.get()).data(), data => ['done', 'failed', 'busy'].includes(data?.status), 'the request');
  assert.equal(done.status, 'done', JSON.stringify(done));
  assert.ok(done.result.count >= 1);
  assert.equal((await post.get()).get('status'), 'removed');
  const run = (await runs('scheduled_note_ends').get()).data();
  assert.equal(run.last_trigger, 'admin');
  assert.equal(run.last_actor_id, 'admin-run-now');

  const unknown = adminDb.collection('maintenance_requests').doc(randomUUID());
  await unknown.set({ task: 'format_disk', status: 'queued', actor_id: 'admin-run-now', reason: 'Integration check', created_at: Timestamp.now() });
  const rejected = await until(async () => (await unknown.get()).data(), data => data?.status !== 'queued', 'the unknown task');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.code, 'invalid_maintenance_task');
});
