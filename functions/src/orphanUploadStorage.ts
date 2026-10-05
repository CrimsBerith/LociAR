import { randomUUID } from 'node:crypto';
import { bucket, db, FieldValue, Timestamp } from './core';
import {
  ORPHAN_UPLOAD_GRACE_HOURS, scanOrphanUploadFolders, resumeOrphanUploadReclamations,
  type OrphanUploadIO, type UploadReclamation, type UploadScanCursor,
} from './orphanUploads';

const CURSOR = () => db.collection('system').doc('world_map_orphan_cursor');
const CLAIM = (postId: string) => db.collection('storage_reclamations').doc(postId);
const QUEUE = () => db.collection('storage_reclamation_queue');
const LEASE_MS = 15 * 60_000; // Longer than the scheduled function's 540-second deadline.

/** Each call makes one bounded GCS request; the bookmark survives object deletes/page changes. */
export function orphanUploadIO(now = Date.now()): OrphanUploadIO {
  const withLease = async (job: UploadReclamation, action: (
    tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference,
  ) => void) => {
    const ref = QUEUE().doc(job.post_id);
    await db.runTransaction(async (tx) => {
      const [current, deletion, profile] = await tx.getAll(
        ref, db.collection('account_deletion_jobs').doc(job.creator_id), db.collection('profiles').doc(job.creator_id),
      );
      if (!current.exists || current.get('lease_id') !== job.lease_id) return;
      if (deletion.exists || profile.get('deleted_at') != null) {
        // Account deletion may have passed its claim collection before this in-flight job.
        // Never recreate a reclaimed marker after that cascade checkpoint.
        tx.delete(ref);
        tx.delete(CLAIM(job.post_id));
        return;
      }
      action(tx, ref);
    });
  };
  return {
    async list(prefix, after, pageSize) {
      // The Firebase Storage emulator does not implement GCS startOffset. Its pageToken is
      // the inclusive object name; production keeps the deletion-safe GCS name-range cursor.
      const position = after ? (process.env.FIREBASE_STORAGE_EMULATOR_HOST ? { pageToken: after } : { startOffset: after }) : {};
      const [listed, next] = await bucket().getFiles({
        prefix, ...position, maxResults: pageSize + 1, autoPaginate: false,
      });
      // startOffset is inclusive. Fetch one extra slot so an unchanged bookmark cannot consume
      // the entire page; if it was deleted, the new first object is processed normally.
      const unbookmarked = listed.filter((file) => !after || Buffer.compare(Buffer.from(file.name), Buffer.from(after)) > 0);
      const files = unbookmarked.slice(0, pageSize).map((file) => {
        const updated = Date.parse(String(file.metadata.updated ?? file.metadata.timeCreated ?? ''));
        return {
          name: file.name,
          // Unknown age is never eligible for deletion.
          updated: Number.isFinite(updated) ? updated : Infinity,
          generation: file.metadata.generation == null ? null : String(file.metadata.generation),
        };
      });
      return { files, hasMore: unbookmarked.length > pageSize || Boolean(next?.pageToken) };
    },
    async readCursor() {
      const data = (await CURSOR().get()).data();
      return {
        last_name: typeof data?.last_name === 'string' ? data.last_name : null,
        pending: data?.pending && typeof data.pending.prefix === 'string' && typeof data.pending.newest === 'number'
          ? data.pending as UploadScanCursor['pending'] : null,
      };
    },
    async saveCursor(cursor) {
      await CURSOR().set({ ...cursor, updated_at: FieldValue.serverTimestamp() });
    },
    async claim(prefix, cutoff) {
      const [creator, rawPostId] = prefix.split('/');
      const postId = rawPostId.toLowerCase();
      const creatorId = creator.toLowerCase();
      const ref = CLAIM(postId);
      await db.runTransaction(async (tx) => {
        const [post, claim, deletion, profile] = await tx.getAll(
          db.collection('posts').doc(postId), ref,
          db.collection('account_deletion_jobs').doc(creatorId), db.collection('profiles').doc(creatorId),
        );
        if (post.exists || claim.exists && claim.get('state') !== 'draft' || deletion.exists || profile.get('deleted_at') != null) return;
        tx.set(ref, {
          post_id: postId, creator_id: creatorId, prefix, state: 'pending', claimed_at: FieldValue.serverTimestamp(),
        });
        tx.set(QUEUE().doc(postId), {
          post_id: postId, creator_id: creatorId, prefix, phase: 'validating', folder_index: 0,
          last_name: null, cutoff, deleted_files: 0, updated_at: FieldValue.serverTimestamp(),
          lease_id: null, lease_until: null,
        });
      });
    },
    async queued(limit) {
      // Jobs move to the end after an attempt, so one failing folder does not hide later jobs.
      const snap = await QUEUE().orderBy('updated_at').limit(limit * 2).get();
      const jobs: UploadReclamation[] = [];
      for (const candidate of snap.docs) {
        if (jobs.length === limit) break;
        const leaseId = randomUUID();
        const job = await db.runTransaction(async (tx) => {
          const current = await tx.get(candidate.ref);
          if (!current.exists || (current.get('lease_until')?.toMillis?.() ?? 0) > now) return null;
          const data = current.data()!;
          if (!['validating', 'deleting'].includes(data.phase) || !Number.isInteger(data.folder_index)
            || data.folder_index < 0 || data.folder_index >= 5 || typeof data.prefix !== 'string') {
            throw new Error('Invalid orphan-upload reclamation job');
          }
          tx.update(candidate.ref, { lease_id: leaseId, lease_until: Timestamp.fromMillis(now + LEASE_MS) });
          return { ...data, lease_id: leaseId } as UploadReclamation;
        });
        if (job) jobs.push(job);
      }
      return jobs;
    },
    async postExists(postId) { return (await db.collection('posts').doc(postId).get()).exists; },
    async saveJob(job) {
      await withLease(job, (tx, ref) => tx.update(ref, { ...job, updated_at: FieldValue.serverTimestamp() }));
    },
    async cancel(job) {
      await withLease(job, (tx, ref) => { tx.delete(ref); tx.delete(CLAIM(job.post_id)); });
    },
    async complete(job) {
      await withLease(job, (tx, ref) => {
        tx.set(CLAIM(job.post_id), {
          post_id: job.post_id, creator_id: job.creator_id, prefix: job.prefix, state: 'reclaimed',
          reclaimed_at: FieldValue.serverTimestamp(), deleted_files: job.deleted_files,
        });
        tx.delete(ref);
      });
    },
    async deleteObject(file) {
      if (!file.generation) throw new Error('Missing Storage generation');
      await bucket().file(file.name).delete({ ignoreNotFound: true, ifGenerationMatch: file.generation });
    },
    async failed(job, error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
      console.error('orphan_upload_reclamation_failed', {
        post_id: job.post_id, phase: job.phase, error_code: /^[a-z0-9_-]{1,40}$/i.test(code) ? code : 'unknown',
      });
      // Persist deletions already completed before the failing generation/API request.
      await withLease(job, (tx, ref) => tx.update(ref, { ...job, updated_at: FieldValue.serverTimestamp() }));
    },
    async release(job) {
      await withLease(job, (tx, ref) => tx.update(ref, {
        // Unprocessed leased jobs keep their age and get priority over this run's attempts.
        lease_id: null, lease_until: null,
      }));
    },
  };
}

/** No TTL on reclaimed markers: an offline draft can retry after an unlimited delay. */
export async function purgeOrphanUploads(now = Date.now()): Promise<number> {
  const io = orphanUploadIO(now);
  let scanError: unknown;
  try {
    await scanOrphanUploadFolders(io, now - ORPHAN_UPLOAD_GRACE_HOURS * 3_600_000);
  } catch (error) {
    scanError = error;
  }
  // Stored work still progresses if the global listing/checkpoint fails.
  const completed = await resumeOrphanUploadReclamations(io);
  if (scanError) throw scanError;
  return completed;
}
