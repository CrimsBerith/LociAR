import { randomUUID } from 'node:crypto';
import { auth, db, FieldValue, Timestamp, type Caller } from './core';
import { deleteAccountStorage } from './accountStorage';
import { claimAnchorDeletion, deleteAnchorOfPost } from './anchors';
import { deleteAnchorOrQueue } from './anchorQueue';
import { accountDeletionRef } from './profileGuard';

export const ACCOUNT_DELETION_LEASE_MS = 10 * 60_000;
const PAGE_SIZE = 300;
type DeletionJob = { uid?: string; status: 'pending' | 'done'; attempts?: number; lease_until?: Timestamp };

/** Fault-test I/O boundaries; these are never accepted from a callable's client payload. */
export type AccountDeletionDependencies = {
  commitBatch?: (batch: FirebaseFirestore.WriteBatch) => Promise<unknown>;
  deleteStorage?: (prefix: string) => Promise<number>;
  deleteAuthUser?: (uid: string) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
};
export type DeletionOutcome = 'done' | 'pending' | 'busy';
class DeletionBudgetExceeded extends Error {}
class DeletionLeaseLost extends Error {}

/** Only invoked after fresh-auth validation and (for Apple) successful grant revocation. */
export async function acceptAccountDeletion(caller: Caller): Promise<void> {
  const jobRef = accountDeletionRef(caller.luid);
  const profileRef = db.collection('profiles').doc(caller.luid);
  await db.runTransaction(async tx => {
    const [job, profile] = await tx.getAll(jobRef, profileRef);
    if (job.exists) {
      tx.set(db.collection('account_access').doc(caller.luid), { state: job.get('status') === 'done' ? 'done' : 'deleting' });
      return;
    }
    tx.create(jobRef, {
      uid: caller.uid, status: 'pending', stage: 'firestore', attempts: 0,
      posts_removed: 0, storage_objects_removed: 0,
      apple_revoked: caller.isAppleUser, created_at: FieldValue.serverTimestamp(), next_at: Timestamp.now(),
    });
    if (profile.exists) tx.update(profileRef, { deleted_at: FieldValue.serverTimestamp() });
    tx.set(db.collection('account_access').doc(caller.luid), { state: 'deleting' });
  }, { maxAttempts: 10 });
}

/** All mutations are awaited. A failed batch cannot advance the cascade to Storage/Auth. */
export async function runAccountDeletion(luid: string, deps: AccountDeletionDependencies = {}): Promise<DeletionOutcome> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budgetMs = deps.budgetMs ?? 240_000;
  const jobRef = accountDeletionRef(luid);
  const owner = randomUUID();
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;
    const data = snap.data() as DeletionJob;
    if (data.status === 'done') return data;
    if (data.lease_until instanceof Timestamp && data.lease_until.toMillis() > now()) return null;
    const leaseUntil = Timestamp.fromMillis(now() + ACCOUNT_DELETION_LEASE_MS);
    tx.update(jobRef, {
      lease_owner: owner, lease_until: leaseUntil, next_at: leaseUntil,
      attempts: FieldValue.increment(1), updated_at: FieldValue.serverTimestamp(),
    });
    return data;
  });
  if (!job) return 'busy';
  if (job.status === 'done') return 'done';
  if (!job.uid) throw new Error('Account deletion job lacks an Auth identity');
  const checkBudget = () => { if (now() - started >= budgetMs) throw new DeletionBudgetExceeded(); };
  const commit = deps.commitBatch ?? (batch => batch.commit());
  const assertLease = async (tx: FirebaseFirestore.Transaction) => {
    const current = await tx.get(jobRef);
    if (!current.exists || current.get('lease_owner') !== owner) throw new DeletionLeaseLost();
  };
  const setStage = async (stage: string) => {
    checkBudget();
    await db.runTransaction(async tx => {
      await assertLease(tx);
      tx.update(jobRef, { stage, updated_at: FieldValue.serverTimestamp() });
    });
  };
  const deleteQuery = async (query: FirebaseFirestore.Query) => {
    for (;;) {
      checkBudget();
      const page = await query.limit(PAGE_SIZE).get();
      if (page.empty) return;
      const batch = db.batch();
      page.docs.forEach(doc => batch.delete(doc.ref));
      // BulkWriter.flush()/close() do not propagate every rejected per-operation promise.
      await commit(batch);
      if (page.size < PAGE_SIZE) return;
    }
  };
  try {
    await setStage('firestore');
    for (;;) {
      checkBudget();
      const posts = await db.collection('posts').where('creator_id', '==', luid).limit(PAGE_SIZE).get();
      if (posts.empty) break;
      for (const post of posts.docs) {
        checkBudget();
        await deleteAnchorOfPost(post.get('cloud_anchor_id'), post.id);
        for (const collection of ['likes', 'comments', 'post_saves', 'collection_items', 'filtered_comments']) {
          await deleteQuery(db.collection(collection).where('post_id', '==', post.id));
        }
        await db.collection('media_purge_queue').doc(post.id).delete();
      }
      await db.runTransaction(async tx => {
        await assertLease(tx);
        const remaining = await tx.getAll(...posts.docs.map(post => post.ref));
        const existing = remaining.filter(post => post.exists);
        existing.forEach(post => tx.delete(post.ref));
        tx.update(jobRef, { posts_removed: FieldValue.increment(existing.length) });
      });
    }
    const byField: Array<[string, string]> = [
      ['likes', 'user_id'], ['comments', 'user_id'], ['post_saves', 'user_id'], ['filtered_comments', 'user_id'],
      ['follows', 'follower_id'], ['follows', 'following_id'],
      ['user_blocks', 'blocker_id'], ['user_blocks', 'blocked_id'],
      ['collection_items', 'owner_id'], ['collections', 'owner_id'],
      ['activity_events', 'recipient_id'], ['activity_events', 'actor_id'],
      ['post_view_receipts', 'user_id'], ['analytics_events', 'user_id'],
      ['post_quota', 'owner_luid'], ['anchor_quota', 'owner_luid'], ['arcore_token_quota', 'owner_luid'],
      ['push_tokens', 'owner_luid'], ['push_devices', 'luid'], ['push_quota', 'owner_luid'], ['push_delivery_receipts', 'owner_luid'],
      ['handles', 'luid'], ['avatar_reviews', 'luid'], ['avatar_uploads', 'luid'], ['avatar_screenings', 'luid'], ['avatar_deletions', 'luid'], ['moderation_originals', 'user_id'],
      ['storage_reclamations', 'creator_id'], ['storage_reclamation_queue', 'creator_id'],
      ['invites', 'creator_id'], ['invites', 'redeemed_by'], ['invite_attempts', 'owner_luid'],
    ];
    for (const [collection, field] of byField) await deleteQuery(db.collection(collection).where(field, '==', luid));
    await deleteQuery(db.collection('admin_role_assignments').where('user_id', '==', job.uid));
    await deleteQuery(db.collection('admin_user_invites').where('invited_user_id', '==', job.uid));
    // Legacy ARCore quota buckets predate owner_luid but still have deterministic owner IDs.
    await deleteQuery(db.collection('arcore_token_quota').orderBy('__name__').startAt(`${luid}_`).endAt(`${luid}_\uf8ff`));
    for (;;) {
      checkBudget();
      const anchors = await db.collection('cloud_anchors').where('owner_luid', '==', luid).limit(PAGE_SIZE).get();
      if (anchors.empty) break;
      const outcomes = new Map<string, boolean>();
      for (const record of anchors.docs) {
        const claimed = await claimAnchorDeletion(record.id, record.get('post_id') ?? null);
        outcomes.set(record.id, claimed ? await deleteAnchorOrQueue(record.id) : record.get('state') === 'deleted');
      }
      const batch = db.batch();
      anchors.docs.forEach(record => batch.set(record.ref, {
        owner_luid: FieldValue.delete(), state: outcomes.get(record.id) ? 'deleted' : 'deleting',
        expires_at: FieldValue.delete(),
      }, {merge: true}));
      await commit(batch);
    }
    const anonymize = async (field: string, patch: (doc: FirebaseFirestore.QueryDocumentSnapshot) => FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => {
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      for (;;) {
        checkBudget();
        let query = db.collection('moderation_flags').where(field, '==', luid).orderBy('__name__').limit(PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        if (page.empty) return;
        const batch = db.batch();
        page.docs.forEach(doc => batch.update(doc.ref, patch(doc)));
        await commit(batch);
        cursor = page.docs.at(-1);
        if (page.size < PAGE_SIZE) return;
      }
    };
    await anonymize('user_id', doc => doc.get('reason') === 'profile_text_filtered'
      ? { user_id: null, 'metadata.text': null, author_deleted: true }
      : { user_id: null, reporter_deleted: true });
    await anonymize('metadata.author_id', () => ({ 'metadata.author_id': null, 'metadata.text': null, author_deleted: true }));
    await db.runTransaction(async tx => {
      await assertLease(tx);
      tx.delete(db.collection('profiles').doc(luid));
      tx.delete(db.collection('users_private').doc(luid));
      tx.delete(db.collection('admin_mfa_state').doc(job.uid!));
      tx.update(jobRef, { stage: 'storage' });
    });
    checkBudget();
    const deleteStorage = deps.deleteStorage ?? (prefix => deleteAccountStorage(prefix, checkBudget));
    const objects = await deleteStorage(`${luid}/`);
    await db.runTransaction(async tx => {
      await assertLease(tx);
      tx.update(jobRef, { storage_objects_removed: FieldValue.increment(objects), stage: 'auth' });
    });
    checkBudget();
    try { await (deps.deleteAuthUser ?? (uid => auth.deleteUser(uid)))(job.uid); }
    catch (error) { if ((error as { code?: unknown }).code !== 'auth/user-not-found') throw error; }
    // Repeat after deleting Auth to catch uploads already in flight at the first sweep.
    const lateObjects = await deleteStorage(`${luid}/`);
    await db.runTransaction(async tx => {
      await assertLease(tx);
      tx.update(jobRef, {
        status: 'done', stage: 'done', done_at: FieldValue.serverTimestamp(),
        storage_objects_removed: FieldValue.increment(lateObjects),
        uid: FieldValue.delete(), next_at: FieldValue.delete(), lease_owner: FieldValue.delete(),
        lease_until: FieldValue.delete(), last_error: FieldValue.delete(),
      });
      tx.set(db.collection('account_access').doc(luid), { state: 'done' });
    });
    return 'done';
  } catch (error) {
    if (error instanceof DeletionLeaseLost) return 'busy';
    const yieldOnly = error instanceof DeletionBudgetExceeded;
    await db.runTransaction(async tx => {
      const current = await tx.get(jobRef);
      if (current.get('lease_owner') !== owner) return;
      const attempts = Number(current.get('attempts') ?? 1);
      tx.update(jobRef, {
        lease_owner: FieldValue.delete(), lease_until: FieldValue.delete(),
        next_at: Timestamp.fromMillis(now() + (yieldOnly ? 0 : Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000)),
        // SDK messages may contain email, paths or credential details; never persist them.
        last_error: yieldOnly ? 'budget_exhausted' : 'retryable_operation_failed',
        updated_at: FieldValue.serverTimestamp(),
      });
    });
    if (yieldOnly) return 'pending';
    throw error;
  }
}

/** Single-field next_at index reaches jobs abandoned by an abruptly terminated worker too. */
export async function retryPendingAccountDeletions(now = Date.now(), maxJobs = 10): Promise<number> {
  const pending = await db.collection('account_deletion_jobs').where('next_at', '<=', Timestamp.fromMillis(now))
    .orderBy('next_at').limit(maxJobs).get();
  let done = 0;
  for (const job of pending.docs) {
    try { if (await runAccountDeletion(job.id) === 'done') done++; }
    catch { console.error('account_deletion_retry_failed', { stage: job.get('stage') ?? 'unknown' }); }
  }
  return done;
}
