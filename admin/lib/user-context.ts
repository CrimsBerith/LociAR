import 'server-only';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { verifiedAdminSession, type AdminContext } from './admin-session';
import { adminDb } from './firebase-admin';
import { requireActorAccountActive, requireTargetAccountActive, writeAudit } from './ops';
import { ValidationError, requiredString, uuid } from './validation';
import { needsStepUp, permissionsFor } from './rbac';

export async function readPrivateUserContext(admin: AdminContext, rawLuid: string, kind: 'location' | 'telemetry', rawReason: string) {
  const permission = kind === 'location' ? 'users.location.read' : 'users.telemetry.read';
  // Location and device data need an authenticator session, never an email code alone (rbac.ts).
  if (needsStepUp(admin, permission)) {
    const error = new ValidationError('Sign in with an authenticator code for this action'); error.status = 403; throw error;
  }
  if (!verifiedAdminSession(admin) || !admin.permissions.has(permission)) {
    const error = new ValidationError('Private data access denied'); error.status = 403; throw error;
  }
  const luid = uuid(rawLuid, 'luid').toLowerCase(), reason = requiredString(rawReason, 'reason', 8, 1000);
  const db = adminDb(), now = Date.now();
  return await db.runTransaction(async tx => {
    await requireActorAccountActive(tx, admin.user.id);
    // Context creation precedes this read; role revocation must fence the transaction too.
    const roles = await tx.get(db.collection('admin_role_assignments').where('user_id', '==', admin.user.id).where('revoked_at', '==', null));
    if (!permissionsFor(roles.docs.map(role => String(role.get('role_key')))).has(permission)) {
      const error = new ValidationError('permission_revoked'); error.status = 403; throw error;
    }
    await requireTargetAccountActive(tx, luid);
    const [profile, preference, snapshot] = await tx.getAll(db.collection('profiles').doc(luid),
      db.collection('user_data_preferences').doc(luid), db.collection(kind === 'location' ? 'user_locations' : 'user_device_context').doc(luid));
    if (!profile.exists || profile.get('deleted_at')) throw new ValidationError('User not available');
    const data = snapshot.data();
    const consented = preference.get(kind) === true;
    const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : 0;
    const available = consented && data && data.consent_revision === preference.get('revision') && millis(data.expires_at) > now;
    let result: Record<string, unknown> = { status: consented ? 'unavailable' : 'sharing_disabled' };
    if (available) {
      if (kind === 'location') {
        const age = Math.max(0, now - millis(data.measured_at));
        result = { status: age <= 120_000 ? 'recent' : 'stale', lat: data.lat, lng: data.lng, accuracy: data.accuracy,
          measuredAt: new Date(millis(data.measured_at)).toISOString(), receivedAt: new Date(millis(data.received_at)).toISOString(),
          installationId: data.installation_id };
      } else {
        const events = await tx.get(db.collection('analytics_events').where('user_id', '==', luid).orderBy('created_at', 'desc').limit(30));
        result = { status: 'available', device: { model: data.model, osVersion: data.os_version,
          appVersion: data.app_version, appBuild: data.app_build, locale: data.locale, timeZone: data.time_zone,
          installationId: data.installation_id, observedIp: data.observed_ip, lastSeen: new Date(millis(data.received_at)).toISOString() },
          events: events.docs.filter(d => millis(d.get('expires_at')) > now).map(d => ({ name: d.get('event_name'),
            postId: d.get('post_id') ?? null, at: new Date(millis(d.get('created_at'))).toISOString() })) };
      }
    }
    // Fail closed if the audit cannot commit. Coordinates/IP never enter the audit log.
    writeAudit(tx, randomUUID(), { actorId: admin.user.id, action: `user_${kind}_read`, resourceType: 'private_user_context',
      resourceId: luid, after: { kind, status: result.status }, reason, permissionKey: permission, riskLevel: 'sensitive' });
    return result;
  });
}
