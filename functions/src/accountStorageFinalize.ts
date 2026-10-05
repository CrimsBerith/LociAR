import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { bucket, db, isUUID, REGION, STORAGE_FOLDERS } from './core';
import { accountDeletionRef } from './profileGuard';

type FinalizedObject = { name?: unknown; bucket?: unknown; generation?: unknown };
export type DeletedAccountStorageIO = {
  bucketName: string;
  shouldDelete: (luid: string) => Promise<boolean>;
  deleteGeneration: (name: string, generation: string) => Promise<unknown>;
};
export type FinalizeCleanupResult = 'ignored' | 'deleted' | 'gone' | 'replaced';

const io = (): DeletedAccountStorageIO => ({
  bucketName: bucket().name,
  async shouldDelete(luid) {
    const [job, access] = await db.getAll(accountDeletionRef(luid), db.collection('account_access').doc(luid));
    return job.exists || ['deleting', 'done'].includes(String(access.get('state') ?? ''));
  },
  async deleteGeneration(name, generation) {
    // A redelivered event may describe a superseded generation. Never delete its replacement.
    await bucket().file(name).delete({ ifGenerationMatch: generation });
  },
});

/** Storage finalization can arrive AFTER both deletion sweeps and Auth removal. The permanent
 * fence still owns that decision, and retry-enabled delivery keeps transient I/O failures live.
 */
export async function cleanupFinalizedAccountObject(object: FinalizedObject, deps: DeletedAccountStorageIO = io()): Promise<FinalizeCleanupResult> {
  if (typeof object.name !== 'string' || object.bucket !== deps.bucketName) return 'ignored';
  const [folder, owner, ...rest] = object.name.split('/');
  if (!(STORAGE_FOLDERS as readonly string[]).includes(folder) || !isUUID(owner) || rest.length === 0 || rest.join('/') === '') return 'ignored';
  if (!await deps.shouldDelete(owner.toLowerCase())) return 'ignored';
  const generation = typeof object.generation === 'string' && /^[1-9][0-9]{0,19}$/.test(object.generation)
    ? object.generation
    : typeof object.generation === 'number' && Number.isSafeInteger(object.generation) && object.generation > 0
      ? String(object.generation) : null;
  // Trusted Storage events include an exact generation. Missing/rounded data cannot justify an
  // unconditional delete; reject so delivery can retry instead of forgetting a deleted account.
  if (!generation) throw new Error('Finalized Storage generation is unavailable');
  try {
    await deps.deleteGeneration(object.name, generation);
    return 'deleted';
  } catch (error) {
    const code = Number((error as { code?: unknown }).code);
    if (code === 404) return 'gone';
    if (code === 412) return 'replaced';
    throw error; // Eventarc retries Firestore/Storage outages; never swallow a transient failure.
  }
}

export const onDeletedAccountObjectFinalized = onObjectFinalized({
  region: REGION, retry: true, maxInstances: 1, timeoutSeconds: 120, memory: '256MiB',
}, async event => cleanupFinalizedAccountObject(event.data));
