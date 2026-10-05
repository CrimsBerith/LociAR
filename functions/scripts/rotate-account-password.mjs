import { createReviewCredentialsFile } from './review-credentials.mjs';

// Rotate an explicitly selected existing test/review account without changing
// its profile, roles or custom claims. The private output is written first.
const email = process.env.ACCOUNT_EMAIL?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ACCOUNT_EMAIL must identify the existing account');
const project = process.env.FIREBASE_PROJECT_ID;
const emulator = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '');
if (project !== 'lociar-2f38c' && !(emulator && project?.startsWith('demo-'))) throw new Error('Select lociar-2f38c, or a local demo Auth emulator');
const { password } = createReviewCredentialsFile(process.env.REVIEW_CREDENTIALS_FILE, email);
const { auth } = await import('./_admin.mjs');
const user = await auth.getUserByEmail(email); // Never create a replacement account on a failed lookup.
await auth.updateUser(user.uid, { password });
await auth.revokeRefreshTokens(user.uid);
console.log('Password rotated and refresh sessions revoked. Retrieve the password from the private credential file.');
