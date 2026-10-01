import 'server-only';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured.');
  return value;
}

/** Project id from the Firebase App Hosting / Cloud Run runtime (FIREBASE_CONFIG, GOOGLE_CLOUD_PROJECT). */
function runtimeProjectId(): string {
  const config = process.env.FIREBASE_CONFIG;
  if (config) {
    try {
      const parsed = JSON.parse(config) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    } catch {
      // FIREBASE_CONFIG can also be a file path; fall through to the plain variables.
    }
  }
  return required(process.env.GOOGLE_CLOUD_PROJECT ? 'GOOGLE_CLOUD_PROJECT' : 'GCLOUD_PROJECT');
}

/**
 * Server-only Firebase Admin app. On Firebase App Hosting it runs as the backend's service account
 * (Application Default Credentials), so no key exists anywhere. FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON
 * or base64) is only for local `next dev`. Never expose either through a NEXT_PUBLIC_ variable.
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const projectId = runtimeProjectId();
    return initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    });
  }
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const credentials = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
  return initializeApp({
    credential: cert({
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key,
    }),
    projectId: credentials.project_id,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${credentials.project_id}.firebasestorage.app`,
  });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminBucket = () => getStorage(adminApp()).bucket();
export const projectId = () => adminApp().options.projectId as string;

/** Firestore Timestamp / Date / string → ISO string for rendering. */
export function iso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value == null ? null : iso(value);
}
