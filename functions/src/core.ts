import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { v5 as uuidv5, validate as uuidValidate } from 'uuid';

if (getApps().length === 0) initializeApp();

/** Functions region. Must match LOCIAR_FIREBASE_FUNCTIONS_REGION in the iOS build settings. */
export const REGION = process.env.LOCIAR_FUNCTIONS_REGION || 'us-central1';
// Low cap: new projects have a small Cloud Run CPU quota per region; raise once the quota is increased.
setGlobalOptions({ region: REGION, maxInstances: 3 });

/**
 * Callables reject requests without a valid App Check token in production. v2 callables are not
 * covered by the console's enforcement switch, so this has to be set per function. The emulator
 * suite (local E2E) has no attestation provider, so enforcement is off there.
 */
export const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true';

export const db = getFirestore();
export const auth = getAuth();
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp, HttpsError };

/**
 * LociAR uses UUIDs as user identifiers everywhere (posts, storage paths, social rows).
 * Firebase UIDs are mapped deterministically to a UUIDv5 ("luid"). The iOS client computes
 * the same value (FirebaseIdentity.swift); Security Rules read it from the `luid` custom claim.
 */
export const LUID_NAMESPACE = '6f1c6d0e-3b8a-5c7e-9f21-4c0a7d2e9b13';
export function luidForUid(uid: string): string {
  return uuidv5(uid, LUID_NAMESPACE).toLowerCase();
}

/** Storage "buckets" from the Supabase era are top-level folders in the single Firebase bucket. */
export const STORAGE_FOLDERS = [
  'post-layer-assets',
  'post-video-assets',
  'post-world-maps',
  'post-reference-images',
  'post-surface-textures',
  'avatars',
] as const;

export type Caller = {
  uid: string;
  luid: string;
  email: string | null;
  emailVerified: boolean;
  provider: string;
  isAppleUser: boolean;
  adminRole: string | null;
};

export function requireCaller(request: CallableRequest<unknown>): Caller {
  const token = request.auth?.token;
  if (!request.auth || !token) throw new HttpsError('unauthenticated', 'Authentication required');
  const provider = String(token.firebase?.sign_in_provider ?? 'unknown');
  const identities = (token.firebase?.identities ?? {}) as Record<string, unknown>;
  return {
    uid: request.auth.uid,
    luid: luidForUid(request.auth.uid),
    email: typeof token.email === 'string' ? token.email : null,
    emailVerified: token.email_verified === true,
    provider,
    isAppleUser: provider === 'apple.com' || Object.prototype.hasOwnProperty.call(identities, 'apple.com'),
    adminRole: typeof token.admin_role === 'string' ? token.admin_role : null,
  };
}

/** Apple accounts are verified by Apple; password accounts need a verified email. */
export function identityVerified(caller: Caller): boolean {
  return caller.isAppleUser || caller.emailVerified;
}

export function isUUID(value: unknown): value is string {
  return typeof value === 'string' && uuidValidate(value);
}

export async function logEvent(event: {
  userId?: string | null;
  postId?: string | null;
  name: string;
  properties?: Record<string, unknown>;
  lat?: number;
  lng?: number;
}): Promise<void> {
  await db.collection('analytics_events').add({
    user_id: event.userId ?? null,
    post_id: event.postId ?? null,
    event_name: event.name,
    properties: event.properties ?? {},
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    created_at: FieldValue.serverTimestamp(),
    // TTL policy on analytics_events.expires_at deletes events (incl. coarse location) after 180 days.
    expires_at: Timestamp.fromMillis(Date.now() + ANALYTICS_RETENTION_DAYS * 86_400_000),
  });
}

export const ANALYTICS_RETENTION_DAYS = 180;

/** Deletes every object under `<folder>/<prefix>` for each LociAR storage folder. */
export async function deleteStoragePrefix(prefix: string): Promise<number> {
  let removed = 0;
  for (const folder of STORAGE_FOLDERS) {
    const [files] = await bucket().getFiles({ prefix: `${folder}/${prefix}` });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
    removed += files.length;
  }
  return removed;
}
