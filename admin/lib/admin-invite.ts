import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { recordAudit } from './ops';
import { isKnownRole } from './rbac';
import { inviteAcceptError } from './policy';

/** Grants the role of the newest pending invite addressed to this Firebase user. */
export async function acceptPendingAdminInvite(uid: string, identity: { email?: string | null; emailVerified?: boolean }): Promise<string | null> {
  const db = adminDb();
  let inviteSnap;
  try {
    inviteSnap = await db.collection('admin_user_invites')
      .where('invited_user_id', '==', uid)
      .where('status', '==', 'sent')
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
  } catch {
    return 'invite_lookup_failed';
  }
  const invite = inviteSnap.docs[0];
  if (!invite) return null;
  // The role goes only to the verified owner of the invited address, within 72 hours of the invite.
  const created = invite.data().created_at?.toMillis?.();
  const rejection = inviteAcceptError(
    { email: invite.data().email, status: invite.data().status, expires_at_ms: invite.data().expires_at?.toMillis?.(), created_at_ms: created },
    identity,
    Date.now(),
  );
  if (rejection) return rejection;
  const roleKey = invite.data().requested_role_key as string | null;
  if (!roleKey) {
    await invite.ref.update({ status: 'accepted', accepted_at: FieldValue.serverTimestamp() });
    return null;
  }
  if (!isKnownRole(roleKey)) return 'invalid_invite_role';

  try {
    await db.collection('admin_role_assignments').doc(`${uid}_${roleKey}`).set({
      user_id: uid,
      role_key: roleKey,
      granted_by: invite.data().invited_by ?? null,
      revoked_at: null,
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {
    return 'role_assignment_failed';
  }
  try {
    await invite.ref.update({ status: 'accepted', accepted_at: FieldValue.serverTimestamp() });
  } catch {
    return 'invite_accept_failed';
  }
  try {
    await recordAudit(`invite-accept-${invite.id}`, {
      actorId: uid,
      action: 'admin_invite_accepted',
      resourceType: 'admin_role_assignment',
      resourceId: uid,
      after: { roleKey, inviteId: invite.id },
      reason: 'Administrator accepted a recorded invitation.',
      permissionKey: 'admin_users.write',
      riskLevel: 'critical',
    });
  } catch {
    return 'invite_audit_failed';
  }
  return null;
}
