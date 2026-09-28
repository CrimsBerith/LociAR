import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured.');
  return value;
}

/**
 * Server-only Firebase Admin app. Credentials come from FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON or
 * base64). Never expose it through a NEXT_PUBLIC_ variable.
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = required('FIREBASE_SERVICE_ACCOUNT_JSON');
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
