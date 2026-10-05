import 'server-only';
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebase-admin';
import { ConflictError, writeAudit } from './ops';
import { isKnownRole } from './rbac';
import { INVITE_TTL_MS, inviteAcceptError } from './policy';
import { accountDeletionStarted } from './account-lifecycle';

type InvitationInput = {
  key: string; email: string; handle: string | null; roleKey: string | null; reason: string; actorId: string;
};

function matchesRequest(invite: DocumentData, input: InvitationInput) {
  return invite.email === input.email && (invite.handle ?? null) === input.handle
    && (invite.requested_role_key ?? null) === input.roleKey
    && invite.reason === input.reason && invite.invited_by === input.actorId;
}

/** Auth account creation may be retried; the invitation and its audit commit together. */
export async function createUserInvitation(input: InvitationInput) {
  const db = adminDb();
  const ref = db.collection('admin_user_invites').doc(input.key);
  const existing = await ref.get();
  if (existing.exists && !matchesRequest(existing.data()!, input)) throw new ConflictError('idempotency_key_reused');
  let uid = existing.get('invited_user_id') as string | undefined;
  if (!uid) {
    try {
      uid = (await adminAuth().getUserByEmail(input.email)).uid;
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      try {
        uid = (await adminAuth().createUser({ email: input.email, emailVerified: false })).uid;
      } catch (createError) {
        // Concurrent invitations to the same address can create only one Auth account.
        if ((createError as { code?: string }).code !== 'auth/email-already-exists') throw createError;
        uid = (await adminAuth().getUserByEmail(input.email)).uid;
      }
    }
  }
  const invitedUid = uid;
  return db.runTransaction(async tx => {
    const [stored, audit] = await Promise.all([
      tx.get(ref), tx.get(db.collection('admin_audit_log').doc(input.key)),
    ]);
    if (await accountDeletionStarted(invitedUid, tx) || await accountDeletionStarted(input.actorId, tx)) {
      throw new ConflictError('account_deletion_in_progress');
    }
    if (stored.exists && !matchesRequest(stored.data()!, input)) throw new ConflictError('idempotency_key_reused');
    if (audit.exists && (audit.get('action') !== 'user_invited' || audit.get('resource_id') !== input.key
      || audit.get('actor_id') !== input.actorId)) throw new ConflictError('idempotency_key_reused');
    const invite = stored.exists ? stored.data()! : {
      id: input.key, email: input.email, handle: input.handle, requested_role_key: input.roleKey,
      invited_user_id: invitedUid, invited_by: input.actorId, status: 'sent', reason: input.reason,
      created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
    };
    if (!stored.exists) tx.create(ref, invite);
    // Repair legacy invitations recorded before audit creation failed, without a second invite.
    if (!audit.exists) writeAudit(tx, input.key, {
      actorId: input.actorId, action: 'user_invited', resourceType: 'user_invite', resourceId: input.key,
      after: { email: input.email, handle: input.handle, roleKey: input.roleKey }, reason: input.reason,
      permissionKey: 'users.invite', riskLevel: 'sensitive',
    });
    return { invite, email: input.email, idempotent: stored.exists };
  });
}

type Identity = { email?: string | null; emailVerified?: boolean };

/** The role, acceptance marker and immutable audit are one atomic, retryable commit. */
export async function acceptUserInvitation(uid: string, identity: Identity, inviteId: string, regularOnly = false): Promise<string | null> {
  const db = adminDb();
  try {
    return await db.runTransaction(async tx => {
      if (await accountDeletionStarted(uid, tx)) return 'account_deletion_in_progress';
      const inviteRef = db.collection('admin_user_invites').doc(inviteId);
      const invite = await tx.get(inviteRef);
      if (!invite.exists || invite.get('invited_user_id') !== uid) return 'invite_not_found';
      const data = invite.data()!;
      const roleKey = data.requested_role_key as string | null;
      if (regularOnly && roleKey) return 'admin_invite_requires_admin_sign_in';
      if (roleKey && (!isKnownRole(roleKey) || roleKey === 'super_admin')) return 'invalid_invite_role';
      const auditKey = `invite-accept-${invite.id}`;
      const audit = await tx.get(db.collection('admin_audit_log').doc(auditKey));
      if (audit.exists && (audit.get('actor_id') !== uid || audit.get('resource_id') !== uid
        || audit.get('action') !== (roleKey ? 'admin_invite_accepted' : 'user_invite_accepted'))) {
        return 'invite_audit_conflict';
      }
      // Replay never recreates a role which an administrator has subsequently revoked.
      if (data.status === 'accepted' && audit.exists) return null;
      const rejection = inviteAcceptError({
        email: data.email, status: data.status, expires_at_ms: data.expires_at?.toMillis?.(),
        created_at_ms: data.created_at?.toMillis?.(),
      }, identity, Date.now());
      // Legacy accepted invitations can have a missing audit; repair only the evidence,
      // never grant a previously removed/revoked role during this compatibility path.
      if (data.status === 'accepted' && !audit.exists) {
        if (identity.emailVerified !== true || identity.email?.toLowerCase() !== String(data.email).toLowerCase()) return 'invite_email_mismatch';
        if (roleKey) {
          const existingRole = await tx.get(db.collection('admin_role_assignments').doc(`${uid}_${roleKey}`));
          if (!existingRole.exists) return 'invite_legacy_incomplete';
        }
      } else if (rejection) return rejection;
      if (roleKey && data.status !== 'accepted') {
        tx.set(db.collection('admin_role_assignments').doc(`${uid}_${roleKey}`), {
          user_id: uid, role_key: roleKey, granted_by: data.invited_by ?? null,
          revoked_at: null, created_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (data.status !== 'accepted') tx.update(inviteRef, { status: 'accepted', accepted_at: FieldValue.serverTimestamp() });
      if (!audit.exists) writeAudit(tx, auditKey, {
        actorId: uid, action: roleKey ? 'admin_invite_accepted' : 'user_invite_accepted',
        resourceType: roleKey ? 'admin_role_assignment' : 'user_invite', resourceId: uid,
        after: { roleKey, inviteId: invite.id }, reason: 'Verified email owner accepted a recorded invitation.',
        permissionKey: roleKey ? 'admin_users.write' : 'invitation.accept', riskLevel: roleKey ? 'critical' : 'sensitive',
      });
      return null;
    });
  } catch (error) {
    console.error('[invite-accept]', error);
    return 'invite_accept_failed';
  }
}

/** Grants only the newest pending invitation when an administrator signs in. */
export async function acceptPendingAdminInvite(uid: string, identity: Identity): Promise<string | null> {
  try {
    const pending = await adminDb().collection('admin_user_invites').where('invited_user_id', '==', uid)
      .where('status', '==', 'sent').orderBy('created_at', 'desc').limit(1).get();
    const invite = pending.docs[0];
    return invite ? acceptUserInvitation(uid, identity, invite.id) : null;
  } catch {
    return 'invite_lookup_failed';
  }
}
