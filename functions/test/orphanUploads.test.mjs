import test from 'node:test';
import assert from 'node:assert/strict';
import { scanOrphanUploadFolders, resumeOrphanUploadReclamations } from '../lib/orphanUploads.js';

const OWNER = '11111111-1111-5111-8111-111111111111';
const post = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const prefix = (n) => `${OWNER}/${post(n)}/`;
const path = (n, file = 'a.lociarmap', folder = 'post-world-maps') => `${folder}/${prefix(n)}${file}`;
const CUTOFF = 100_000;

function storageFixture() {
  const files = new Map();
  const posts = new Set();
  const claims = new Map();
  const jobs = new Map();
  const errors = [];
  let cursor = { last_name: null, pending: null };
  let clock = 0;
  const io = {
    async list(p, after, size) {
      const all = [...files.values()].filter((file) => file.name.startsWith(p) && (!after || Buffer.compare(Buffer.from(file.name), Buffer.from(after)) > 0))
        .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
      return { files: all.slice(0, size).map((file) => ({ ...file })), hasMore: all.length > size };
    },
    async readCursor() { return structuredClone(cursor); },
    async saveCursor(value) { cursor = structuredClone(value); },
    async claim(p, cutoff) {
      const [, id] = p.split('/');
      await io.beforeClaim?.(id);
      if (posts.has(id) || claims.has(id)) return;
      claims.set(id, 'pending');
      jobs.set(id, { post_id: id, creator_id: OWNER, prefix: p, cutoff, phase: 'validating', folder_index: 0,
        last_name: null, deleted_files: 0, lease_id: 'test-lease', updated: clock++ });
    },
    async queued(limit) { return [...jobs.values()].sort((a, b) => a.updated - b.updated).slice(0, limit).map((job) => ({ ...job })); },
    async postExists(id) { return posts.has(id); },
    async saveJob(job) { jobs.set(job.post_id, { ...job, updated: clock++ }); },
    async cancel(job) { jobs.delete(job.post_id); claims.delete(job.post_id); },
    async complete(job) { jobs.delete(job.post_id); claims.set(job.post_id, 'reclaimed'); },
    async deleteObject(file) {
      await io.beforeDelete?.(file);
      const current = files.get(file.name);
      if (current && current.generation !== file.generation) throw Object.assign(new Error('Generation changed'), { code: 412 });
      files.delete(file.name);
    },
    async failed(job, error) { errors.push(error); await io.saveJob(job); },
    async release() {},
  };
  const put = (name, updated = 1, generation = '1') => files.set(name, { name, updated, generation });
  return { io, files, posts, claims, jobs, errors, put, cursor: () => structuredClone(cursor) };
}

test('300 valid old folders cannot permanently hide the next orphan', async () => {
  const f = storageFixture();
  for (let i = 1; i <= 300; i++) { f.put(path(i)); f.posts.add(post(i)); }
  f.put(path(301));
  await scanOrphanUploadFolders(f.io, CUTOFF);
  assert.equal(f.jobs.size, 0);
  assert.equal(f.cursor().last_name, path(300));
  await scanOrphanUploadFolders(f.io, CUTOFF);
  assert.equal(await resumeOrphanUploadReclamations(f.io), 1);
  assert.equal(f.files.has(path(301)), false);
  assert.equal(f.files.size, 300);
  assert.equal(f.claims.get(post(301)), 'reclaimed');
});

test('a fresh sibling on the next page preserves the whole folder, even across runs', async () => {
  const f = storageFixture();
  f.put(path(1, 'a.lociarmap'));
  f.put(path(1, 'b.lociarmap'), CUTOFF + 1);
  f.put(path(2));
  await scanOrphanUploadFolders(f.io, CUTOFF, { maxPages: 1, pageSize: 1 });
  assert.equal(f.claims.size, 0, 'an unfinished folder is not eligible yet');
  await scanOrphanUploadFolders(f.io, CUTOFF, { maxPages: 1, pageSize: 1 });
  assert.equal(f.claims.size, 0);
  await scanOrphanUploadFolders(f.io, CUTOFF, { maxPages: 1, pageSize: 1 });
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.has(path(1, 'a.lociarmap')), true);
  assert.equal(f.files.has(path(1, 'b.lociarmap')), true);
  assert.equal(f.files.has(path(2)), false);
});

test('arbitrarily large folders validate completely before bounded deletion resumes', async () => {
  const f = storageFixture();
  for (let i = 0; i < 1001; i++) f.put(path(1, `${String(i).padStart(4, '0')}.lociarmap`));
  await scanOrphanUploadFolders(f.io, CUTOFF, { pageSize: 50, maxPages: 30 });
  assert.equal(f.jobs.size, 1);
  await resumeOrphanUploadReclamations(f.io, { maxPages: 2, pageSize: 50 });
  assert.equal(f.files.size, 1001, 'no deletes before every page/folder has been validated');
  assert.equal(f.jobs.get(post(1)).phase, 'validating');
  for (let i = 0; i < 40 && f.jobs.size; i++) await resumeOrphanUploadReclamations(f.io, { maxPages: 2, pageSize: 50 });
  assert.equal(f.jobs.size, 0);
  assert.equal(f.files.size, 0);
  assert.equal(f.claims.get(post(1)), 'reclaimed');
});

test('a post committed before the transactional claim always keeps its map', async () => {
  const f = storageFixture();
  f.put(path(1));
  f.io.beforeClaim = async (id) => f.posts.add(id);
  await scanOrphanUploadFolders(f.io, CUTOFF);
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.has(path(1)), true);
  assert.equal(f.claims.size, 0);
});

test('a fresh upload between scan and claim cancels reclamation without deleting siblings', async () => {
  const f = storageFixture();
  f.put(path(1));
  f.io.beforeClaim = async () => f.put(path(1, 'b.lociarmap'), CUTOFF + 1);
  await scanOrphanUploadFolders(f.io, CUTOFF);
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.size, 2);
  assert.equal(f.claims.size, 0, 'fresh draft is available again');
});

test('validation checks other legacy AR folders before deleting the world map', async () => {
  const f = storageFixture();
  f.put(path(1));
  f.put(path(1, 'reference.jpg', 'post-reference-images'), CUTOFF + 1);
  await scanOrphanUploadFolders(f.io, CUTOFF);
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.size, 2);
  assert.equal(f.claims.size, 0);
});

test('an individual failed deletion is resumable and does not block other jobs', async () => {
  const f = storageFixture();
  f.put(path(1)); f.put(path(2));
  await scanOrphanUploadFolders(f.io, CUTOFF);
  f.io.beforeDelete = async (file) => { if (file.name === path(1)) throw new Error('Storage unavailable'); };
  assert.equal(await resumeOrphanUploadReclamations(f.io), 1);
  assert.equal(f.files.has(path(1)), true);
  assert.equal(f.files.has(path(2)), false);
  assert.equal(f.jobs.size, 1);
  assert.equal(f.errors.length, 1);
  delete f.io.beforeDelete;
  assert.equal(await resumeOrphanUploadReclamations(f.io), 1);
  assert.equal(f.files.size, 0);
});

test('unused leased jobs retain priority when one large job consumes the page budget', async () => {
  const f = storageFixture();
  for (let i = 0; i < 100; i++) f.put(path(1, `${String(i).padStart(3, '0')}.lociarmap`));
  f.put(path(2));
  await scanOrphanUploadFolders(f.io, CUTOFF);
  for (let run = 0; run < 25 && f.jobs.has(post(2)); run++) {
    await resumeOrphanUploadReclamations(f.io, { maxPages: 1, pageSize: 1 });
  }
  assert.equal(f.jobs.has(post(2)), false);
  assert.equal(f.files.has(path(2)), false);
  assert.equal(f.jobs.get(post(1)).phase, 'validating', 'small job finishes before the large job exhausts its pages');
});

test('generation changes preserve replacement data and retain the expired-draft marker', async () => {
  const f = storageFixture();
  f.put(path(1));
  await scanOrphanUploadFolders(f.io, CUTOFF);
  f.io.beforeDelete = async (file) => f.put(file.name, CUTOFF + 1, '2');
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.errors[0].code, 412);
  assert.equal(f.files.get(path(1)).generation, '2');
  delete f.io.beforeDelete;
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.has(path(1)), true);
  assert.equal(f.claims.get(post(1)), 'reclaimed');
});

test('wrap reaches inserts behind the cursor and deletion of the bookmark loses no successor', async () => {
  const f = storageFixture();
  f.put(path(2)); f.put(path(3));
  await scanOrphanUploadFolders(f.io, CUTOFF, { maxPages: 1, pageSize: 1 });
  f.files.delete(path(2));
  f.put(path(1));
  await scanOrphanUploadFolders(f.io, CUTOFF, { maxPages: 1, pageSize: 1 });
  assert.equal(f.claims.has(post(3)), true);
  assert.equal(f.cursor().last_name, null);
  await scanOrphanUploadFolders(f.io, CUTOFF);
  assert.equal(f.claims.has(post(1)), true);
});

test('unknown object age or generation fails closed without deleting a sibling', async () => {
  const f = storageFixture();
  f.put(path(1)); f.put(path(1, 'b.lociarmap'), 1, null);
  await scanOrphanUploadFolders(f.io, CUTOFF);
  await resumeOrphanUploadReclamations(f.io);
  assert.equal(f.files.size, 2);
  assert.equal(f.claims.size, 0);
});
