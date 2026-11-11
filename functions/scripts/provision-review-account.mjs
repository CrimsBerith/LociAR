import { FieldValue } from 'firebase-admin/firestore';
import { createReviewCredentialsFile } from './review-credentials.mjs';

// Must be on a domain the owner controls (password resets go there). lociar.app is not registered.
const email = 'apple-review@alfagolab.com';
const { password, filePath } = createReviewCredentialsFile(process.env.REVIEW_CREDENTIALS_FILE, email);
console.log('Private credential file created:', filePath);
const { auth, db, luidForUid } = await import('./_admin.mjs');

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
}
if (user) {
  await auth.updateUser(user.uid, { password });
  await auth.revokeRefreshTokens(user.uid);
  console.log('User already exists in Auth, updated password, uid:', user.uid);
} else {
  user = await auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: 'Apple Reviewer',
  });
  console.log('Created user in Auth, uid:', user.uid);
}

const luid = luidForUid(user.uid);
await auth.setCustomUserClaims(user.uid, { luid });
console.log('Set custom claims luid:', luid);

const handle = 'apple_review';
const profileRef = db.collection('profiles').doc(luid);
const handleRef = db.collection('handles').doc(handle);
const privateRef = db.collection('users_private').doc(luid);
const accessRef = db.collection('account_access').doc(luid);

// Enforce exclusive ownership and create related Firestore records atomically.
// Idempotent for the same account: a previous partial setup can be resumed safely.
const wasCreated = await db.runTransaction(async tx => {
  const [profile, reservation, privateRecord, access] = await tx.getAll(profileRef, handleRef, privateRef, accessRef);
  if (reservation.exists && reservation.get('luid') !== luid) {
    throw new Error('Review handle is reserved by another account; no profile data changed.');
  }
  if (profile.exists && profile.get('handle') !== handle) {
    throw new Error('Existing review account uses a different handle; resolve ownership manually.');
  }
  if (privateRecord.exists && (privateRecord.get('uid') ?? privateRecord.get('firebase_uid')) !== user.uid) {
    throw new Error('Review private identity does not match Auth; no account state changed.');
  }
  if (!reservation.exists) tx.create(handleRef, { luid, created_at: FieldValue.serverTimestamp() });
  if (!profile.exists) tx.create(profileRef, {
    id: luid,
    handle,
    display_name: 'Apple Reviewer',
    avatar_url: null,
    bio: 'Official App Review account for LociAR',
    follower_count: 0,
    following_count: 0,
    public_post_count: 0,
    suspended: false,
    deleted_at: null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  // Same field names as ensureProfile (functions/src/profile.ts) and the admin panel.
  if (!privateRecord.exists) tx.create(privateRef, {
    uid: user.uid,
    auth_provider: 'password',
    created_at: FieldValue.serverTimestamp(),
  });
  if (!access.exists || access.get('state') !== 'active') tx.set(accessRef, { state: 'active' }, { merge: true });
  return !profile.exists;
});
console.log(wasCreated ? 'Created review profile and owned handle atomically.' : 'Review profile verified; access active.');

console.log('Provisioning complete. Transfer the private file to your password manager and App Store Connect.');
console.log('Email:', email);
console.log('LUID:', luid);
console.log('Handle:', handle);
