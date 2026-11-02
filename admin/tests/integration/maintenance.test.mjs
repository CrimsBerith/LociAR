import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { readMaintenanceOverview, requestMaintenanceRun, setMaintenancePaused, MAINTENANCE_TASKS } = await import('../../lib/maintenance.ts');
const { luidForUid } = await import('../../lib/account-lifecycle.ts');
const db = adminDb();
after(async () => Promise.all(getApps().map(deleteApp)));
const actor = 'maintenance-' + randomUUID();
const reason = 'Maintenance panel verification';

test('"run now" queues one audited request per task and refuses a second while the first is open', async () => {
  const key = randomUUID();
  const [first, retry] = await Promise.all([requestMaintenanceRun('removed_media', actor, reason, key), requestMaintenanceRun('removed_media', actor, reason, key)]);
  assert.deepEqual(first, { task: 'removed_media', status: 'queued' });
  assert.deepEqual(retry, first, 'a retried request reuses its receipt');
  const request = await db.collection('maintenance_requests').doc(key).get();
  assert.equal(request.get('status'), 'queued');
  assert.equal(request.get('actor_id'), actor);
  const audit = await db.collection('admin_audit_log').doc(key).get();
  assert.equal(audit.get('action'), 'maintenance_run_requested');
  assert.equal(audit.get('permission_key'), 'system.maintenance');
  await assert.rejects(requestMaintenanceRun('removed_media', actor, reason, randomUUID()), /maintenance_task_busy/);
  await db.collection('maintenance_requests').doc(key).update({ status: 'done' });
  await requestMaintenanceRun('removed_media', actor, reason, randomUUID());
  await assert.rejects(requestMaintenanceRun('format_disk', actor, reason, randomUUID()), /invalid_maintenance_task/);
});

test('automatic runs pause and resume with an audit row; account deletion retries cannot be paused', async () => {
  const pause = randomUUID();
  assert.deepEqual(await setMaintenancePaused('note_density', true, actor, reason, pause), { task: 'note_density', paused: true });
  assert.equal((await db.collection('system').doc('maintenance').get()).get('paused.note_density'), true);
  assert.equal((await db.collection('admin_audit_log').doc(pause).get()).get('action'), 'maintenance_paused');
  await assert.rejects(setMaintenancePaused('note_density', false, actor, reason, pause), /idempotency_key_reused/);
  let overview = await readMaintenanceOverview();
  assert.equal(overview.tasks.find(task => task.name === 'note_density').paused, true);
  await setMaintenancePaused('note_density', false, actor, reason, randomUUID());
  overview = await readMaintenanceOverview();
  assert.equal(overview.tasks.find(task => task.name === 'note_density').paused, false);
  await assert.rejects(setMaintenancePaused('account_deletions', true, actor, reason, randomUUID()), /maintenance_task_not_pausable/);
  assert.equal((await db.collection('system').doc('maintenance').get()).get('paused.account_deletions'), undefined);
});

test('the overview shows each task with its last run, backlog and recent requests, numbers only', async () => {
  await db.collection('maintenance_runs').doc('post_counters').set({ last_status: 'failed', last_code: 'unavailable', consecutive_failures: 2,
    last_result: { repaired: 4, note: 'ignored' }, last_trigger: 'schedule', last_duration_ms: 1200, last_finished_at: new Date() });
  await db.collection('avatar_deletions').doc(randomUUID()).set({ next_at: new Date(Date.now() - 1000) });
  const overview = await readMaintenanceOverview();
  assert.deepEqual(overview.tasks.map(task => task.name), MAINTENANCE_TASKS.map(task => task.name));
  const counters = overview.tasks.find(task => task.name === 'post_counters');
  assert.equal(counters.lastStatus, 'failed');
  assert.equal(counters.consecutiveFailures, 2);
  assert.deepEqual(counters.lastResult, { repaired: 4 });
  assert.ok(overview.tasks.find(task => task.name === 'avatar_deletions').backlog >= 1);
  assert.equal(overview.tasks.find(task => task.name === 'post_media_cleanup').backlog, null, 'nightly passes have no backlog');
  assert.ok(overview.requests.length >= 1);
});

test('a deleted admin identity can neither run nor pause maintenance', async () => {
  const uid = 'deleted-' + randomUUID();
  await db.collection('account_deletion_jobs').doc(luidForUid(uid)).set({ status: 'done' });
  await assert.rejects(requestMaintenanceRun('scheduled_note_ends', uid, reason, randomUUID()), /account_deleting/);
  await assert.rejects(setMaintenancePaused('scheduled_note_ends', true, uid, reason, randomUUID()), /account_deleting/);
});
