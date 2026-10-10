import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { bucket, REGION } from './core';
import { STORAGE_FINALIZE_TOPIC, storageObjectFromNotification } from './storageFinalizeEvents';
/** World map geometry must never carry a permanent Firebase bearer download token. The exact
 * generation precondition prevents a late event from modifying a replacement object. */
function worldMapStorage() {
  const storage = bucket();
  return {
    name: storage.name,
    update: (name: string, generation: string) => storage.file(name).setMetadata(
      { metadata: { firebaseStorageDownloadTokens: null } }, { preconditionOpts: { ifGenerationMatch: generation } }),
  };
}

function storageGeneration(value: unknown): string {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
}

export async function revokeWorldMapToken(object: { name?: string; bucket?: string; generation?: unknown }, io = worldMapStorage()) {
  if (!object.name?.startsWith('post-world-maps/') || object.bucket !== io.name) return 'ignored';
  const generation = storageGeneration(object.generation);
  if (!/^[1-9]\d*$/.test(generation)) throw new Error('Missing Storage generation');
  try {
    await io.update(object.name, generation);
    return 'revoked';
  } catch (error) {
    if ([404, 412].includes(Number((error as { code?: unknown }).code))) return 'superseded';
    throw error;
  }
}

export const onWorldMapFinalized = onMessagePublished({ topic: STORAGE_FINALIZE_TOPIC, region: REGION, retry: true, maxInstances: 1 }, async event => {
  const object = storageObjectFromNotification(event.data.message, bucket().name);
  return object ? revokeWorldMapToken(object) : 'ignored';
});
