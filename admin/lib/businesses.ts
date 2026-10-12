import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { permissionsFor } from './rbac';
import { checkReceipt, ConflictError, mutationHash, requireActorAccountActive, requireTargetAccountActive, writeAudit } from './ops';
import { requiredString, uuid, ValidationError } from './validation';
import { anyBlocked } from './content-moderation';
import { placement } from './content-ops';
import { emptyContent } from './content-models';

export async function operateBusiness(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const id = uuid(body.id, 'id').toLowerCase(), action = String(body.action), permission = action === 'update' ? 'places.write' : 'posts.moderate';
  if (!['update', 'invalidate', 'revalidate'].includes(action)) throw new ValidationError('Invalid action');
  const hash = mutationHash(actor, 'business_' + action, id, { body, reason }), db = adminDb();
  return db.runTransaction(async tx => {
    await requireActorAccountActive(tx, actor);
    const roles = await tx.get(db.collection('admin_role_assignments').where('user_id', '==', actor).where('revoked_at', '==', null));
    if (!permissionsFor(roles.docs.map(r => r.get('role_key'))).has(permission)) throw new ConflictError('permission_revoked');
    const receipt = await tx.get(db.collection('admin_audit_log').doc(key));
    if (checkReceipt(receipt, hash)) return { id };
    if (action === 'update') {
      const venue = await tx.get(db.collection('business_places').doc(id));
      if (!venue.exists) throw new ValidationError('Business not found');
      const name = requiredString(body.name, 'name', 1, 120), lat = body.lat, lng = body.lng, diameter = body.diameter;
      if (anyBlocked([name]) || typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90
          || typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180 || typeof diameter !== 'number' || !Number.isFinite(diameter)
          || diameter < 2 || diameter > 5 || !['active', 'paused', 'closed', 'moved'].includes(String(body.status))) throw new ValidationError('Invalid business settings');
      const changed = name !== venue.get('name') || lat !== venue.get('lat') || lng !== venue.get('lng') || body.status !== venue.get('status');
      const next = { name, lat, lng, status: body.status, notify_diameter_m: diameter, revision: Number(venue.get('revision') ?? 1) + (changed ? 1 : 0) };
      tx.update(venue.ref, { ...next, updated_by_admin: actor, updated_at: FieldValue.serverTimestamp() });
      writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'business_update', resourceType: 'business', resourceId: id,
        before: { name: venue.get('name'), status: venue.get('status'), revision: venue.get('revision') }, after: next, reason, permissionKey: permission, riskLevel: 'sensitive' });
    } else {
      const note = await tx.get(db.collection('posts').doc(id));
      if (!note.exists || note.get('note_kind') !== 'business' || note.get('deleted_at') || note.get('status') === 'removed') throw new ValidationError('Business note unavailable');
      await requireTargetAccountActive(tx, note.get('creator_id'));
      const venue = await tx.get(db.collection('business_places').doc(note.get('business_id')));
      if (action === 'revalidate' && (!venue.exists || venue.get('status') !== 'active')) throw new ConflictError('Business must be active');
      if (action === 'revalidate') {
        const meta = { id: venue.id, name: venue.get('name'), lat: venue.get('lat'), lng: venue.get('lng'), radius: venue.get('notify_diameter_m') / 2, revision: venue.get('revision') };
        tx.update(note.ref, { ...placement({ ...emptyContent, authorId: note.get('creator_id'), text: note.get('caption'), lat: meta.lat, lng: meta.lng }, id),
          lat: meta.lat, lng: meta.lng, status: 'pending_review', business_note: meta, business_invalidated: false, updated_at: FieldValue.serverTimestamp() });
      } else tx.update(note.ref, { status: 'flagged', business_invalidated: true, business_invalidated_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
      writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'business_note_' + action, resourceType: 'post', resourceId: id,
        after: { status: action === 'revalidate' ? 'pending_review' : 'flagged', businessId: venue.id }, reason, permissionKey: permission, riskLevel: 'sensitive' });
    }
    return { id };
  });
}
