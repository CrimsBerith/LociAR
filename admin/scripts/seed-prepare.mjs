#!/usr/bin/env node
// Before a launch-seed load: finds the super admin who acts for the load and creates the managed content
// user @loci.guide if it does not exist yet. Prints only the actor uid on stdout (for scripts); everything
// else goes to stderr. Run like seed-notes.mjs:
//   GOOGLE_CLOUD_PROJECT=lociar-2f38c node --conditions=react-server --import ./tests/register-typescript.mjs \
//     scripts/seed-prepare.mjs [--actor-email you@example.com]
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({ options: { 'actor-email': { type: 'string' } } });
const { adminDb, adminAuth } = await import('../lib/firebase-admin.ts');
const { createManagedUser } = await import('../lib/content-ops.ts');
const { derivedKey } = await import('../lib/ops.ts');

const HANDLE = 'loci.guide', DISPLAY_NAME = 'LociAR Guide';
const db = adminDb();

async function superAdmins() {
  const roles = await db.collection('admin_role_assignments').where('role_key', '==', 'super_admin').where('revoked_at', '==', null).get();
  const ids = [...new Set(roles.docs.map(role => role.get('user_id')).filter(id => typeof id === 'string'))];
  const users = await Promise.all(ids.map(uid => adminAuth().getUser(uid).catch(() => null)));
  return users.filter(user => user && !user.disabled);
}

const admins = await superAdmins();
const wanted = opts['actor-email']?.trim().toLowerCase();
const actor = wanted ? admins.find(user => user.email?.toLowerCase() === wanted) : admins[0];
if (!actor) {
  console.error(wanted ? `No active super admin with the email ${wanted}.` : 'No active super admin found.');
  process.exit(1);
}
if (!wanted && admins.length > 1) {
  console.error(`Several super admins: ${admins.map(user => user.email ?? user.uid).join(', ')}. Using ${actor.email ?? actor.uid}; pass --actor-email to choose.`);
}
console.error(`Actor: ${actor.email ?? actor.uid}`);

const reservation = await db.collection('handles').doc(HANDLE).get();
if (reservation.exists) {
  console.error(`@${HANDLE} exists.`);
} else {
  // A fixed key makes a rerun after a partial failure finish the same user instead of creating another.
  const user = await createManagedUser({ handle: HANDLE, displayName: DISPLAY_NAME, email: '' }, actor.uid,
    'Launch seed content account (docs/release/LAUNCH_SEED.md)', derivedKey(`launch-seed:${HANDLE}`, 'managed-user'));
  console.error(`Created @${user.handle}.`);
}
console.log(actor.uid);
