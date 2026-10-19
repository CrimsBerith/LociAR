import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const db = adminDb();
after(() => Promise.all(getApps().map(deleteApp)));

const BATCH = 'world-capitals-2026-10';
const adminRoot = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Runs the owner's importer (admin/scripts/seed-notes.mjs) the way the runbook does, against the emulator. */
async function importer(...args) {
  try {
    const { stdout, stderr } = await execute(process.execPath,
      ['--conditions=react-server', '--import', './tests/register-typescript.mjs', 'scripts/seed-notes.mjs', ...args],
      { cwd: adminRoot, env: { ...process.env, GOOGLE_CLOUD_PROJECT: 'demo-lociar' } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}
const seedPosts = async () => (await db.collection('posts').where('seed_batch', '==', BATCH).get()).docs;

test('the launch seed importer checks first, loads each place once through the audited path and retires the batch', async () => {
  const actor = 'seed-' + randomUUID(), author = randomUUID();
  await db.collection('admin_role_assignments').doc(actor).set({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await db.collection('profiles').doc(author).set({ handle: 'loci.guide', display_name: 'LociAR Guide', admin_managed: true, suspended: false, deleted_at: null });
  await db.collection('handles').doc('loci.guide').set({ luid: author });
  const run = (...args) => importer('--seed', 'world-capitals', '--actor', actor, ...args);

  const dry = await run('--only', 'london,madrid');
  assert.equal(dry.code, 0, dry.stderr);
  assert.match(dry.stdout, /^London +7 notes {2}1 AR/m);
  assert.match(dry.stdout, /^Madrid +7 notes {2}1 AR {2}8 held \(approx\)/m, 'Madrid has an approximate anchor');
  assert.match(dry.stdout, /16 items: 0 already loaded, 0 with problems, 8 held for an approximate anchor\./);
  assert.equal((await seedPosts()).length, 0, 'a dry run writes nothing');

  const load = await run('--only', 'london,madrid', '--apply');
  assert.equal(load.code, 0, load.stderr);
  assert.match(load.stdout, /Loaded 8 items\./, 'approximate anchors stay held without --allow-approx');
  const posts = (await seedPosts()).map(doc => doc.data());
  assert.equal(posts.length, 8);
  assert.ok(posts.every(p => p.creator_id === author && p.created_by_admin === actor && p.status === 'active' && p.geospatial === false));
  assert.equal(posts.filter(p => p.note_kind === 'location').length, 7);
  assert.equal(posts.filter(p => p.push_state === 'approved').length, 1, 'one note per place notifies');
  assert.equal((await db.collection('admin_audit_log').where('actor_id', '==', actor).get()).size, 8, 'one audit receipt per item');

  const again = await run('--only', 'london', '--apply');
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /8 items: 8 already loaded/);
  assert.match(again.stdout, /Loaded 0 items\./, 'a rerun skips what is loaded');

  // The business batch checks against the same author and zones; it is never written here.
  const businesses = await importer('--seed', 'landmark-businesses', '--actor', actor);
  assert.equal(businesses.code, 0, businesses.stderr);
  assert.match(businesses.stdout, /\b\d+ items: 0 already loaded, 0 with problems,/);

  const retire = await run('--retire');
  assert.equal(retire.code, 0, retire.stderr);
  assert.match(retire.stdout, /^8 posts from world-capitals\.json end at /m);
  assert.ok((await seedPosts()).every(doc => doc.get('ends_at')), 'every seed post has an end date');
});

test('the launch seed importer reads seed files from scripts/seed/ only', async () => {
  for (const seed of ['../../package', '/etc/passwd', 'world-capitals.json', '../scripts/seed/world-capitals']) {
    const run = await importer('--seed', seed, '--actor', 'anyone');
    assert.equal(run.code, 2, seed);
    assert.match(run.stderr, /^Seeds in scripts\/seed\/: .*\bworld-capitals\b/m);
  }
});
