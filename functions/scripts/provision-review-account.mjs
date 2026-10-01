import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db, luidForUid } from './_admin.mjs';

const email = 'apple-review@lociar.app';
const password = `Review_${randomBytes(8).toString('hex')}_2026!`;

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  console.log('User already exists in Auth, updated password, uid:', user.uid);
} catch {
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

console.log('--- CREDENTIALS ---');
console.log('Email:', email);
console.log('Password:', password);
console.log('LUID:', luid);
console.log('Handle:', handle);
