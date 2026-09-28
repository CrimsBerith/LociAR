// Shared Admin SDK bootstrap for maintenance scripts.
// Auth: `gcloud auth application-default login` or GOOGLE_APPLICATION_CREDENTIALS=<service-account.json>.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { v5 as uuidv5 } from 'uuid';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID=<your-project-id>');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId });
export const auth = getAuth();
export const db = getFirestore();
export const LUID_NAMESPACE = '6f1c6d0e-3b8a-5c7e-9f21-4c0a7d2e9b13';
export const luidForUid = (uid) => uuidv5(uid, LUID_NAMESPACE).toLowerCase();
