// Grants super_admin to the first operator and enables TOTP MFA for the project.
// Usage: FIREBASE_PROJECT_ID=my-project node scripts/bootstrap-admin.mjs you@example.com
// Requires the project to be upgraded to Firebase Authentication with Identity Platform (for MFA).
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db } from './_admin.mjs';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@')) {
  console.error('Usage: node scripts/bootstrap-admin.mjs <email>');
  process.exit(1);
}

let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  user = await auth.createUser({ email, emailVerified: true });
  console.log('Created auth user', user.uid);
}

await db.collection('admin_role_assignments').doc(`${user.uid}_super_admin`).set({
  user_id: user.uid,
  role_key: 'super_admin',
  granted_by: 'bootstrap-script',
  revoked_at: null,
  created_at: FieldValue.serverTimestamp(),
}, { merge: true });
await db.collection('admin_audit_log').doc(`bootstrap-${user.uid}`).set({
  actor_id: 'bootstrap-script',
  action: 'admin_bootstrap_super_admin',
  resource_type: 'admin_role_assignment',
  resource_id: user.uid,
  reason: 'Initial production operator',
  permission_key: 'admin_users.write',
  risk_level: 'critical',
  created_at: FieldValue.serverTimestamp(),
});
console.log(`super_admin granted to ${email} (${user.uid})`);

try {
  await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  });
  console.log('TOTP multi-factor authentication enabled.');
} catch (error) {
  console.warn('Could not enable TOTP MFA (upgrade to Identity Platform first):', error.message);
}
