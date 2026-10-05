/** Bounded, resumable housekeeping. Storage/Firestore access is supplied by cleanup.ts. */
export const ORPHAN_MAP_PREFIX = 'post-world-maps/';
export const ORPHAN_UPLOAD_GRACE_HOURS = 48;
export const RECLAIM_STORAGE_FOLDERS = [
  'post-world-maps', 'post-reference-images', 'post-surface-textures', 'post-layer-assets', 'post-video-assets',
] as const;
export type UploadObject = { name: string; updated: number; generation: string | null };
export type UploadPage = { files: UploadObject[]; hasMore: boolean };
export type UploadScanCursor = { last_name: string | null; pending: { prefix: string; newest: number } | null };
export type UploadReclamation = {
  lease_id: string;
  post_id: string;
  creator_id: string;
  prefix: string;
  phase: 'validating' | 'deleting';
  folder_index: number;
  last_name: string | null;
  cutoff: number;
  deleted_files: number;
};
export type OrphanUploadIO = {
  list(prefix: string, after: string | null, pageSize: number): Promise<UploadPage>;
  readCursor(): Promise<UploadScanCursor>;
  saveCursor(cursor: UploadScanCursor): Promise<void>;
  /** Transactionally refuses a committed post or an already claimed draft. */
  claim(prefix: string, cutoff: number): Promise<void>;
  queued(limit: number): Promise<UploadReclamation[]>;
  postExists(postId: string): Promise<boolean>;
  saveJob(job: UploadReclamation): Promise<void>;
  cancel(job: UploadReclamation): Promise<void>;
  complete(job: UploadReclamation): Promise<void>;
  deleteObject(file: UploadObject): Promise<void>;
  failed(job: UploadReclamation, error: unknown): Promise<void>;
  release(job: UploadReclamation): Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_CURSOR = (): UploadScanCursor => ({ last_name: null, pending: null });

function folderOf(name: string): string | null {
  const [root, luid, post, file] = name.split('/');
  if (root !== 'post-world-maps' || !UUID.test(luid ?? '') || !UUID.test(post ?? '') || !file) return null;
  return `${luid}/${post}/`;
}

/** All folders consume the scan budget, including valid posts. The next run resumes beyond them. */
export async function scanOrphanUploadFolders(
  io: OrphanUploadIO,
  cutoff: number,
  { maxPages = 5, pageSize = 300, maxFolders = 300 } = {},
): Promise<void> {
  let cursor = await io.readCursor();
  let finished = 0;
  const finishFolder = async () => {
    if (!cursor.pending) return;
    if (cursor.pending.newest < cutoff) await io.claim(cursor.pending.prefix, cutoff);
    cursor = { ...cursor, pending: null };
    finished++;
  };
  for (let page = 0; page < maxPages; page++) {
    const { files, hasMore } = await io.list(ORPHAN_MAP_PREFIX, cursor.last_name, pageSize);
    for (const file of files) {
      const prefix = folderOf(file.name);
      if (cursor.pending && cursor.pending.prefix !== prefix) {
        await finishFolder();
        if (finished >= maxFolders) {
          await io.saveCursor(cursor);
          return;
        }
      }
      if (prefix) {
        cursor = {
          last_name: file.name,
          pending: { prefix, newest: Math.max(cursor.pending?.newest ?? 0, file.updated) },
        };
      } else {
        cursor = { ...cursor, last_name: file.name };
      }
    }
    if (!hasMore) {
      await finishFolder();
      await io.saveCursor(EMPTY_CURSOR()); // Wrap; inserts behind the cursor are reached next time.
      return;
    }
    await io.saveCursor(cursor); // An unfinished folder carries its newest timestamp across pages/runs.
  }
}

/**
 * A claim freezes client uploads and createPost before validation starts. Validate every related
 * folder before deleting any file; both validation and deletion resume after a bounded page budget.
 * Generation preconditions protect against privileged overwrites outside the client rules.
 */
export async function resumeOrphanUploadReclamations(
  io: OrphanUploadIO,
  { maxPages = 20, pageSize = 300, maxJobs = 5 } = {},
): Promise<number> {
  const jobs = await io.queued(maxJobs);
  let pages = 0;
  let completed = 0;
  for (const original of jobs) {
    let job = { ...original };
    try {
      while (pages < maxPages) {
        if (await io.postExists(job.post_id)) {
          await io.cancel(job); // A privileged repair can attach a post; preserve all remaining files.
          break;
        }
        const prefix = `${RECLAIM_STORAGE_FOLDERS[job.folder_index]}/${job.prefix}`;
        const { files, hasMore } = await io.list(prefix, job.phase === 'validating' ? job.last_name : null, pageSize);
        pages++;
        if (files.some((file) => !Number.isFinite(file.updated) || file.updated >= job.cutoff || !file.generation)) {
          // A fresh upload before the claim or an unexpected privileged write must be kept.
          if (job.phase === 'validating') await io.cancel(job);
          else await io.complete(job); // Preserve the expired-draft marker after a partial deletion.
          break;
        }
        if (job.phase === 'validating') {
          job.last_name = files.at(-1)?.name ?? job.last_name;
        } else {
          // Never use a prefix delete: only the generations inspected above are eligible.
          for (const file of files) {
            await io.deleteObject(file);
            job.deleted_files++;
          }
        }
        if (!hasMore) {
          job.folder_index++;
          job.last_name = null;
          if (job.folder_index === RECLAIM_STORAGE_FOLDERS.length) {
            if (job.phase === 'validating') {
              job.phase = 'deleting';
              job.folder_index = 0;
            } else {
              await io.complete(job);
              completed++;
              break;
            }
          }
        }
        await io.saveJob(job);
      }
    } catch (error) {
      // Keep the durable claim/job; another job must still get a turn after an individual failure.
      await io.failed(job, error);
    }
    if (pages >= maxPages) break;
  }
  // Even jobs not reached within this run's budget must release their leases.
  await Promise.all(jobs.map((job) => io.release(job)));
  return completed;
}
