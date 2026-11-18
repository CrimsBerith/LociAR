/**
 * Admin mutations re-check the actor's role inside their transaction (ops.requireActorPermission),
 * so integration actors need a live role assignment, exactly like a real administrator.
 */
export async function grantRole(db, uid, role = 'super_admin') {
  await db.collection('admin_role_assignments').doc(`${uid}_${role}`).set({ user_id: uid, role_key: role, revoked_at: null });
  return uid;
}
