import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { operatePlaceNote, setPlaceNoteSettings, likeThreshold, notificationCandidates, approvedNotes } = await import('../../lib/place-notes.ts');
const { parseContentInput, saveAdminPost } = await import('../../lib/content-ops.ts');
const { emptyContent } = await import('../../lib/content-models.ts');
const db = adminDb(), reason = 'Location note operation regression check';
after(() => Promise.all(getApps().map(deleteApp)));

async function actor(role = 'super_admin') {
  const id = 'notes-' + randomUUID();
  await db.collection('admin_role_assignments').doc(id).set({ user_id: id, role_key: role, revoked_at: null });
  return id;
}
async function note(extra = {}) {
  const id = randomUUID(), author = randomUUID();
  await db.collection('profiles').doc(author).set({ handle: 'a-' + author.slice(0, 6), suspended: false, deleted_at: null });
  await db.collection('posts').doc(id).set({ creator_id: author, caption: 'Entrance at the back', status: 'active', visibility: 'public', age_rating: 'all',
    deleted_at: null, note_kind: 'location', notify_radius_m: 20, push_state: 'none', likes_count: 0, lat: 41, lng: 29, ...extra });
  return db.collection('posts').doc(id);
}

test('approval, revocation, radius and end date are audited, idempotent and validated', async () => {
  const admin = await actor(), ref = await note(), key = randomUUID();
  await Promise.all([operatePlaceNote({ action: 'approve_push', id: ref.id }, admin, reason, key), operatePlaceNote({ action: 'approve_push', id: ref.id }, admin, reason, key)]);
  let p = (await ref.get()).data();
  assert.equal(p.push_state, 'approved'); assert.equal(p.push_approved_by, admin);
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('action'), 'place_note_approve_push');
  await assert.rejects(operatePlaceNote({ action: 'set_radius', id: ref.id, radius: 5 }, admin, reason, randomUUID()), /radius must be 15–100/);
  await operatePlaceNote({ action: 'set_radius', id: ref.id, radius: 42.4 }, admin, reason, randomUUID());
  assert.equal((await ref.get()).get('notify_radius_m'), 42);
  await assert.rejects(operatePlaceNote({ action: 'set_end', id: ref.id, endsAt: new Date(Date.now() - 1000).toISOString() }, admin, reason, randomUUID()), /future/);
  const end = new Date(Date.now() + 86_400_000).toISOString();
  await operatePlaceNote({ action: 'set_end', id: ref.id, endsAt: end }, admin, reason, randomUUID());
  assert.equal((await ref.get()).get('ends_at').toDate().toISOString(), end);
  await operatePlaceNote({ action: 'set_end', id: ref.id, endsAt: null }, admin, reason, randomUUID());
  assert.equal((await ref.get()).get('ends_at'), undefined, 'cleared: notes never expire on their own');
  await operatePlaceNote({ action: 'revoke_push', id: ref.id }, admin, reason, randomUUID());
  p = (await ref.get()).data(); assert.equal(p.push_state, 'revoked');
});

test('only public active notes can be approved and roles are enforced', async () => {
  const admin = await actor();
  const pending = await note({ status: 'pending_review' });
  await assert.rejects(operatePlaceNote({ action: 'approve_push', id: pending.id }, admin, reason, randomUUID()), /note_must_be_public_and_active/);
  const removed = await note({ status: 'removed', deleted_at: new Date() });
  await assert.rejects(operatePlaceNote({ action: 'approve_push', id: removed.id }, admin, reason, randomUUID()), /note_unavailable/);
  const operations = await actor('ar_operations_admin'), ref = await note();
  await assert.rejects(operatePlaceNote({ action: 'approve_push', id: ref.id }, operations, reason, randomUUID()), /permission_revoked/);
  await operatePlaceNote({ action: 'set_radius', id: ref.id, radius: 30 }, operations, reason, randomUUID());
  assert.equal((await ref.get()).get('notify_radius_m'), 30);
});

test('like threshold drives the candidate queue, most liked first, excluding approved notes', async () => {
  const admin = await actor();
  await setPlaceNoteSettings({ likeThreshold: 900 }, admin, reason, randomUUID());
  assert.equal(await likeThreshold(), 900);
  await assert.rejects(setPlaceNoteSettings({ likeThreshold: 0 }, admin, reason, randomUUID()), /1–1000/);
  const low = await note({ likes_count: 905 }), high = await note({ likes_count: 950 }), approved = await note({ likes_count: 990, push_state: 'approved' });
  await note({ likes_count: 899 }); await note({ likes_count: 999, status: 'pending_review' });
  const queue = (await notificationCandidates(900)).map(d => d.id);
  assert.deepEqual(queue.filter(id => [low.id, high.id, approved.id].includes(id)), [high.id, low.id]);
  assert.ok((await approvedNotes()).some(d => d.id === approved.id));
  await setPlaceNoteSettings({ likeThreshold: 3 }, admin, reason, randomUUID());
});

test('administrators can place a location note anywhere and approve it in the same audited step', async () => {
  const admin = await actor(), author = randomUUID();
  await db.collection('profiles').doc(author).set({ handle: 'm-' + author.slice(0, 6), suspended: false, deleted_at: null });
  const body = parseContentInput({ ...emptyContent, authorId: author, caption: 'Use the side door', lat: -31, lng: 111, status: 'active',
    locationNote: true, notifyRadius: 35, approveNotifications: true });
  const { id } = await saveAdminPost(body, admin, reason, randomUUID());
  const p = (await db.collection('posts').doc(id).get()).data();
  assert.equal(p.note_kind, 'location'); assert.equal(p.notify_radius_m, 35); assert.equal(p.push_state, 'approved'); assert.equal(p.location_note.source, 'admin');
  assert.throws(() => parseContentInput({ ...emptyContent, authorId: author, caption: 'x', locationNote: true, notifyRadius: 500 }), /notification radius/);
  const draft = parseContentInput({ ...emptyContent, authorId: author, caption: 'Pending note', lat: -31.1, lng: 111, status: 'pending_review', locationNote: true, approveNotifications: true });
  await assert.rejects(saveAdminPost(draft, admin, reason, randomUUID()), /active public note/);
});

test('dense-spot size and on-site unlock radius are validated and audited with the like threshold', async () => {
  const { placeNoteSettings } = await import('../../lib/place-notes.ts');
  const admin = await actor(), key = randomUUID();
  await setPlaceNoteSettings({ likeThreshold: 4, denseThreshold: 40, unlockRadius: 2 }, admin, reason, key);
  assert.deepEqual(await placeNoteSettings(), { likeThreshold: 4, denseThreshold: 40, unlockRadius: 2 });
  assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('after_state').unlock_radius_m, 2);
  await assert.rejects(setPlaceNoteSettings({ likeThreshold: 4, denseThreshold: 1 }, admin, reason, randomUUID()), /dense spot size/);
  await assert.rejects(setPlaceNoteSettings({ likeThreshold: 4, unlockRadius: 80 }, admin, reason, randomUUID()), /unlock radius/);
  await setPlaceNoteSettings({ likeThreshold: 3, denseThreshold: 30, unlockRadius: 15 }, admin, reason, randomUUID());
});

test('campaign arrivals default to a 30 m GPS-tolerant entry radius and a 24 h audience location age', async () => {
  const { campaignInput } = await import('../../lib/campaigns.ts');
  const base = { brandId: randomUUID(), name: 'Burger', message: 'Lunch discount', terms: 'Valid today', lat: 41, lng: 29, startsAt: Date.now(), endsAt: Date.now() + 86_400_000 };
  const input = campaignInput(base);
  assert.equal(input.entryRadius, 30); assert.equal(input.audienceMaxAgeMinutes, 1440); assert.equal(input.arrivalDiameter, undefined);
  assert.throws(() => campaignInput({ ...base, entryRadius: 5 }), /entry radius/);
  assert.throws(() => campaignInput({ ...base, audienceMaxAgeMinutes: 5000 }), /location age/);
});
