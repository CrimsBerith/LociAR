/** Cloud Storage publishes object identity attributes only; no bytes, location or bearer-token
 * metadata enters the topic. Pub/Sub allows Functions to stay in us-central1 for Firestore nam5
 * while the existing Firebase bucket stays in us-east1. Only its Storage service agent publishes.
 */
export const STORAGE_FINALIZE_TOPIC = 'lociar-storage-finalized';

export function storageObjectFromNotification(
  message: { attributes?: Record<string, string> }, expectedBucket: string,
): { name: string; bucket: string; generation: string } | null {
  const attributes = message?.attributes ?? {};
  if (attributes.eventType !== 'OBJECT_FINALIZE' || attributes.payloadFormat !== 'NONE'
    || attributes.bucketId !== expectedBucket) return null;
  if (!attributes.objectId || !/^[1-9][0-9]{0,19}$/.test(attributes.objectGeneration ?? '')) {
    throw new Error('Storage notification identity or generation is unavailable');
  }
  return { name: attributes.objectId, bucket: attributes.bucketId, generation: attributes.objectGeneration };
}
