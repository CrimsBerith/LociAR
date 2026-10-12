import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { permissionsFor } from './rbac';
import { checkReceipt, ConflictError, mutationHash, requireActorAccountActive, writeAudit } from './ops';
import { uuid, ValidationError } from './validation';

/** Same range as functions/src/placeNoteRules.ts. */
export const MIN_NOTIFY_RADIUS_M = 15;
export const MAX_NOTIFY_RADIUS_M = 100;
export const DEFAULT_NOTIFY_RADIUS_M = 20;
export const DEFAULT_LIKE_THRESHOLD = 3;

const ACTIONS: Record<string, string> = {
  approve_push: 'posts.moderate', revoke_push: 'posts.moderate', set_radius: 'places.write', set_end: 'posts.moderate',
};
export const placeNoteActions = Object.keys(ACTIONS);
export const permissionForPlaceNoteAction = (action: string) => ACTIONS[action];

export function radius(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_NOTIFY_RADIUS_M || value > MAX_NOTIFY_RADIUS_M) {
    throw new ValidationError(`radius must be ${MIN_NOTIFY_RADIUS_M}–${MAX_NOTIFY_RADIUS_M} m`);
  }
  return Math.round(value);
}

/** A future time, or null to clear the end date. Notes never end on their own. */
function endDate(value: unknown): Timestamp | null {
  if (value === null || value === '') return null;
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms) || ms <= Date.now() + 60_000) throw new ValidationError('end date must be in the future');
  return Timestamp.fromMillis(ms);
}

export async function likeThreshold(): Promise<number> {
  const value = (await adminDb().collection('system').doc('place_notes').get()).get('push_like_threshold');
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_LIKE_THRESHOLD;
}

async function requirePermission(tx: FirebaseFirestore.Transaction, actor: string, permission: string) {
  await requireActorAccountActive(tx, actor);
  const roles = await tx.get(adminDb().collection('admin_role_assignments').where('user_id', '==', actor).where('revoked_at', '==', null));
  if (!permissionsFor(roles.docs.map(r => String(r.get('role_key')))).has(permission)) throw new ConflictError('permission_revoked');
}

/**
 * Notification approval, radius and end date for any public post (location note or AR post).
 * Removing a note uses the normal moderator soft delete.
 */
export async function operatePlaceNote(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const id = uuid(body.id, 'id').toLowerCase(), action = String(body.action), permission = ACTIONS[action];
  if (!permission) throw new ValidationError('Invalid action');
  const hash = mutationHash(actor, 'place_note_' + action, id, { body, reason }), db = adminDb();
  return db.runTransaction(async tx => {
    await requirePermission(tx, actor, permission);
    const [receipt, note] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('posts').doc(id));
    if (checkReceipt(receipt, hash)) return { id };
    if (!note.exists || note.get('deleted_at') || note.get('status') === 'removed') throw new ValidationError('note_unavailable');
    const before = { push_state: note.get('push_state') ?? 'none', notify_radius_m: note.get('notify_radius_m') ?? null, ends_at: note.get('ends_at') ?? null };
    // `audited` mirrors `update` without Firestore sentinels.
    let update: Record<string, unknown>, audited: Record<string, unknown>;
    if (action === 'approve_push') {
      if (note.get('status') !== 'active' || note.get('visibility') !== 'public' || note.get('age_rating') === '18_plus') throw new ConflictError('note_must_be_public_and_active');
      audited = { push_state: 'approved', notify_radius_m: note.get('notify_radius_m') ?? DEFAULT_NOTIFY_RADIUS_M };
      update = { ...audited, push_approved_by: actor, push_approved_at: FieldValue.serverTimestamp() };
    } else if (action === 'revoke_push') {
      audited = { push_state: 'revoked' };
      update = { ...audited, push_revoked_by: actor, push_revoked_at: FieldValue.serverTimestamp() };
    } else if (action === 'set_radius') {
      audited = update = { notify_radius_m: radius(body.radius) };
    } else {
      const ends = endDate(body.endsAt);
      audited = { ends_at: ends ? ends.toDate().toISOString() : null };
      update = { ends_at: ends ?? FieldValue.delete() };
    }
    tx.update(note.ref, { ...update, updated_at: FieldValue.serverTimestamp(), updated_by_admin: actor });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'place_note_' + action, resourceType: 'post', resourceId: id,
      before: { ...before, ends_at: before.ends_at instanceof Timestamp ? before.ends_at.toDate().toISOString() : null }, after: audited,
      reason, permissionKey: permission, riskLevel: 'sensitive' });
    return { id };
  });
}

export const DEFAULT_DENSE_THRESHOLD = 30;
export const DEFAULT_UNLOCK_RADIUS_M = 15;

export async function placeNoteSettings() {
  const doc = await adminDb().collection('system').doc('place_notes').get();
  const like = doc.get('push_like_threshold'), dense = doc.get('dense_threshold'), unlock = doc.get('unlock_radius_m');
  return {
    likeThreshold: Number.isInteger(like) && like >= 1 ? like : DEFAULT_LIKE_THRESHOLD,
    denseThreshold: Number.isInteger(dense) && dense >= 2 ? dense : DEFAULT_DENSE_THRESHOLD,
    unlockRadius: typeof unlock === 'number' && unlock >= 2 && unlock <= 50 ? unlock : DEFAULT_UNLOCK_RADIUS_M,
  };
}

function integer(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new ValidationError(`${name} must be ${min}–${max}`);
  return value;
}

/** Like threshold for the notification queue; dense-spot size and on-site unlock radius. */
export async function setPlaceNoteSettings(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const threshold = integer(body.likeThreshold, 'like threshold', 1, 1000);
  const dense = integer(body.denseThreshold ?? DEFAULT_DENSE_THRESHOLD, 'dense spot size', 2, 1000);
  const unlock = integer(body.unlockRadius ?? DEFAULT_UNLOCK_RADIUS_M, 'unlock radius', 2, 50);
  const db = adminDb(), ref = db.collection('system').doc('place_notes'), hash = mutationHash(actor, 'place_note_settings', 'place_notes', { threshold, dense, unlock, reason });
  return db.runTransaction(async tx => {
    await requirePermission(tx, actor, 'posts.moderate');
    const [receipt, current] = await tx.getAll(db.collection('admin_audit_log').doc(key), ref);
    if (checkReceipt(receipt, hash)) return { likeThreshold: threshold };
    tx.set(ref, { push_like_threshold: threshold, dense_threshold: dense, unlock_radius_m: unlock, updated_by_admin: actor, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'place_note_settings', resourceType: 'system', resourceId: 'place_notes',
      before: { push_like_threshold: current.get('push_like_threshold') ?? DEFAULT_LIKE_THRESHOLD, dense_threshold: current.get('dense_threshold') ?? DEFAULT_DENSE_THRESHOLD,
        unlock_radius_m: current.get('unlock_radius_m') ?? DEFAULT_UNLOCK_RADIUS_M }, after: { push_like_threshold: threshold, dense_threshold: dense, unlock_radius_m: unlock },
      reason, permissionKey: 'posts.moderate', riskLevel: 'sensitive' });
    return { likeThreshold: threshold };
  });
}

/** Active public posts at or above the like threshold that are not approved yet, most liked first. */
export async function notificationCandidates(threshold: number, limit = 50) {
  const page = await adminDb().collection('posts').where('status', '==', 'active').where('likes_count', '>=', threshold)
    .orderBy('likes_count', 'desc').limit(limit * 3).get();
  return page.docs.filter(d => d.get('visibility') === 'public' && !d.get('deleted_at') && d.get('age_rating') !== '18_plus'
    && d.get('push_state') !== 'approved').slice(0, limit);
}

export async function approvedNotes(limit = 100) {
  const page = await adminDb().collection('posts').where('push_state', '==', 'approved').limit(limit).get();
  return page.docs.sort((a, b) => Number(b.get('likes_count') ?? 0) - Number(a.get('likes_count') ?? 0));
}
