import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { operateBusiness } = await import('../../lib/businesses.ts');
const { businessNoteCurrent, invalidateBusinessNotes } = await import('../../../functions/lib/businessRegistry.js');
const { db: functionsDb } = await import('../../../functions/lib/core.js');
const db = adminDb(), reason = 'Verify business lifecycle and note association';
after(async () => Promise.all(getApps().map(deleteApp)));
async function fixture() {
  const actor = randomUUID(), author = randomUUID(), id = randomUUID(), note = randomUUID();
  await db.collection('admin_role_assignments').add({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await db.collection('profiles').doc(author).set({ handle: 'note-author' });
  await db.collection('business_places').doc(id).set({ name: 'Cafe', lat: 39.92, lng: 32.85, status: 'active', revision: 1, notify_diameter_m: 5 });
  await db.collection('posts').doc(note).set({ creator_id: author, caption: 'Try the coffee', is_anonymous: true,
    status: 'active', note_kind: 'business', business_id: id,
    business_note: { id, name: 'Cafe', lat: 39.92, lng: 32.85, radius: 2.5, revision: 1 } });
  const update = { id, action: 'update', name: 'Cafe', lat: 39.92, lng: 32.85, status: 'active', diameter: 5 };
  return { actor, author, id, note, update };
}
test('closure fences existing notes immediately, relocation requires review, and author association survives', async () => {
  const f = await fixture(), noteRef = db.collection('posts').doc(f.note);
  const current = () => functionsDb.runTransaction(async tx => businessNoteCurrent(tx, (await tx.get(functionsDb.collection('posts').doc(f.note))).data()));
  assert.equal(await current(), true);
  const key = randomUUID(), close = { ...f.update, status: 'closed' };
  await operateBusiness(close, f.actor, reason, key);
  await operateBusiness(close, f.actor, reason, key);
  assert.equal((await db.collection('business_places').doc(f.id).get()).get('revision'), 2);
  assert.equal(await current(), false);
  await invalidateBusinessNotes(f.id);
  assert.equal((await noteRef.get()).get('business_invalidated'), true);
  await assert.rejects(operateBusiness({ id: f.note, action: 'revalidate' }, f.actor, reason, randomUUID()), /Business must be active/);
  await operateBusiness({ ...f.update, name: 'New cafe', lat: 39.93 }, f.actor, reason, randomUUID());
  assert.equal(await current(), false, 'reopening cannot silently revive an old note');
  await operateBusiness({ id: f.note, action: 'revalidate' }, f.actor, reason, randomUUID());
  const restored = await noteRef.get();
  assert.equal(restored.get('status'), 'pending_review');
  assert.equal(restored.get('creator_id'), f.author);
  assert.equal(restored.get('business_id'), f.id);
  assert.equal(restored.get('business_note.name'), 'New cafe');
  assert.equal(restored.get('business_note.revision'), 3);
  assert.equal(restored.get('lat'), 39.93);
  assert.equal(await current(), true, 'revision is current but publication still needs moderation');
  await assert.rejects(operateBusiness({ ...close, name: 'Changed' }, f.actor, reason, key), /idempotency_key_reused/);
});
test('diameter-only adjustments preserve notes, explicit invalidation and revoked admin access are enforced', async () => {
  const f = await fixture();
  await operateBusiness({ ...f.update, diameter: 2 }, f.actor, reason, randomUUID());
  assert.equal((await db.collection('business_places').doc(f.id).get()).get('revision'), 1);
  await operateBusiness({ id: f.note, action: 'invalidate' }, f.actor, reason, randomUUID());
  assert.equal((await db.collection('posts').doc(f.note).get()).get('status'), 'flagged');
  await assert.rejects(operateBusiness({ ...f.update, diameter: 10 }, f.actor, reason, randomUUID()), /Invalid business settings/);
  const roles = await db.collection('admin_role_assignments').where('user_id', '==', f.actor).get();
  await Promise.all(roles.docs.map(r => r.ref.update({ revoked_at: new Date() })));
  await assert.rejects(operateBusiness(f.update, f.actor, reason, randomUUID()), /permission_revoked/);
});
