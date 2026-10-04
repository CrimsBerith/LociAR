import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { reasonError } from './errors';
import { v5 as uuidv5, validate as uuidValidate } from 'uuid';

if (getApps().length === 0) initializeApp();

/** Functions region. Must match LOCIAR_FIREBASE_FUNCTIONS_REGION in the iOS build settings. */
export const REGION = process.env.LOCIAR_FUNCTIONS_REGION || 'us-central1';
// Quota budget: event triggers get maxInstances:1 (async, latency-insensitive); user-facing
// callables get maxInstances:2 via CALLABLE_MAX_INSTANCES. Rolling deploys stay well under quota.
// 11 triggers×1 + 10 callables×2 = 31 vCPU peak (+ headroom for new revision startup).
setGlobalOptions({ region: REGION, maxInstances: 1 });

/** User-facing callables need a second instance to avoid cold-start queuing under light load. */
export const CALLABLE_MAX_INSTANCES = 2;

/**
 * Callables reject requests without a valid App Check token in production. v2 callables are not
 * covered by the console's enforcement switch, so this has to be set per function. The emulator
 * suite (local E2E) has no attestation provider, so enforcement is off there.
 */
export const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true';

export const db = getFirestore();
export const auth = getAuth();
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp, HttpsError, logger };

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

export type AnalyticsEvent = {
  userId?: string | null;
  postId?: string | null;
  name: string;
  properties?: Record<string, unknown>;
  lat?: number;
  lng?: number;
};

/** Document body for analytics_events; used by logEvent and by transactions that need a fixed id. */
export function analyticsEventDoc(event: AnalyticsEvent) {
  return {
    user_id: event.userId ?? null,
    post_id: event.postId ?? null,
    event_name: event.name,
    properties: event.properties ?? {},
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    created_at: FieldValue.serverTimestamp(),
    // TTL policy on analytics_events.expires_at deletes events (incl. coarse location) after 180 days.
    expires_at: Timestamp.fromMillis(Date.now() + ANALYTICS_RETENTION_DAYS * 86_400_000),
  };
}

export async function logEvent(event: AnalyticsEvent): Promise<void> {
  await db.collection('analytics_events').add(analyticsEventDoc(event));
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

/**
 * Emergency kill switch: `system/flags` = { kill_switch: true, kill_reason?: string } (admin panel →
 * Sistem, permission system.kill_switch, or the budget alert). While it is on, every write path that
 * costs money or creates content refuses with `unavailable` / reason `service_paused`; reads,
 * reports, blocks and account deletion keep working. Cached per instance for a few seconds.
 */
export type KillableFeature = 'create_post' | 'arcore_token' | 'register_anchor' | 'avatar_upload' | 'push_register';
// No caching in the emulator so tests (and local E2E) see a flag flip immediately.
const FLAGS_TTL_MS = process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : 15_000;
let flagsCache: { at: number; on: boolean } | null = null;

export async function killSwitchOn(now = Date.now()): Promise<boolean> {
  if (flagsCache && now - flagsCache.at < FLAGS_TTL_MS) return flagsCache.on;
  let on = false;
  try {
    on = (await db.collection('system').doc('flags').get()).data()?.kill_switch === true;
  } catch (error) {
    logger.error('kill_switch_read_failed', { error: String(error) });
  }
  flagsCache = { at: now, on };
  return on;
}

/** Test hook: forget the cached flag so the next call reads Firestore again. */
export function resetKillSwitchCache(): void {
  flagsCache = null;
}

export async function assertServiceEnabled(feature: KillableFeature): Promise<void> {
  if (await killSwitchOn()) {
    logger.warn('kill_switch_refused', { feature });
    throw reasonError('unavailable', 'LociAR is temporarily paused', 'service_paused');
  }
}
