// Shared helpers for emulator-backed callable tests (run via `npm run test:emulator`).
// The emulator suite sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST for us.
import { randomUUID } from 'node:crypto';
import { initializeApp as initClient, deleteApp } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeApp as initAdmin, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT = 'demo-lociar';
if (getApps().length === 0) initAdmin({ projectId: PROJECT });
export const adminAuth = getAdminAuth();
export const adminDb = getFirestore();

const clients = [];

/** Creates a verified user, runs ensureProfile and refreshes the ID token so the `luid` claim is present. */
export async function newUser(handle) {
  const app = initClient({ apiKey: 'fake-api-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `client-${randomUUID()}`);
  clients.push(app);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);

  const email = `${randomUUID()}@example.test`;
  const { user } = await createUserWithEmailAndPassword(auth, email, 'correct-horse-battery');
  await adminAuth.updateUser(user.uid, { emailVerified: true });
  await user.getIdToken(true);

  const call = async (name, data) => (await httpsCallable(fns, name)(data)).data;
  const profile = await call('ensureProfile', handle ? { handle } : {});
  await user.getIdToken(true); // pick up the luid custom claim
  return { uid: user.uid, luid: profile.luid, handle: profile.handle, call };
}

/** Runs a callable that must fail and returns the error (code like `functions/already-exists`). */
export async function expectFailure(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the callable to fail, but it succeeded.');
}

export function postBody(overrides = {}) {
  return {
    clientMutationId: randomUUID(),
    pose: { latitude: 41.0335, longitude: 28.978, heading: 10, accuracy: 8 },
    refImageUri: 'native-ar-reference://pending',
    editData: { version: 1, layers: [{ id: randomUUID(), type: 'text', text: 'Merhaba' }] },
    caption: 'Merhaba',
    ageRating: 'all',
    visibility: 'public',
    ...overrides,
  };
}

export async function closeClients() {
  await Promise.all(clients.map((app) => deleteApp(app)));
}
