import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db, luidForUid } from './_admin.mjs';

// Usage: node scripts/provision-review-account.mjs [--rotate]
// Creates the App Review account if missing. An existing account keeps its password unless --rotate
// is passed, so the credential entered in App Store Connect never changes silently. A new password is
// printed to this terminal only — paste it into App Store Connect, never into the repo or an issue.
const email = 'apple-review@lociar.app';
const rotate = process.argv.includes('--rotate');
const newPassword = () => `${randomBytes(18).toString('base64url')}!9a`;

let user;
let password = null;
try {
  user = await auth.getUserByEmail(email);
  if (rotate) {
    password = newPassword();
    await auth.updateUser(user.uid, { password });
    console.log('Rotated the password of the existing review account, uid:', user.uid);
  } else {
    console.log('Review account exists; password unchanged (pass --rotate to replace it), uid:', user.uid);
  }
} catch {
  password = newPassword();
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
const profileSnap = await profileRef.get();

if (!profileSnap.exists) {
  await db.collection('handles').doc(handle).set({
    luid,
    created_at: FieldValue.serverTimestamp(),
  });
  await profileRef.set({
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
  await db.collection('users_private').doc(luid).set({
    firebase_uid: user.uid,
    created_at: FieldValue.serverTimestamp(),
  });
  console.log('Created profile, handle reservation, and private record for luid:', luid);
} else {
  console.log('Profile already exists for luid:', luid);
}

console.log('--- REVIEW ACCOUNT ---');
console.log('Email:', email);
if (password) console.log('Password (enter in App Store Connect, do not store it anywhere else):', password);
console.log('LUID:', luid);
console.log('Handle:', handle);
