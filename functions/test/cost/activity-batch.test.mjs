import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
const { readActivity } = await import('../../lib/anonymousAccess.js');
after(async () => { await deleteApp(getApp()); });

test('activity shares note/author checks within a page, redacts remote text and preserves independent blocks', async t => {
  const uid = randomUUID(), viewer = luidForUid(uid), author = randomUUID(), postId = randomUUID();
  await db.collection('profiles').doc(viewer).set({}); await db.collection('profiles').doc(author).set({});
  await db.collection('posts').doc(postId).set({ creator_id: author, status: 'active', visibility: 'public',
    is_anonymous: true, note_kind: 'location', lat: 41, lng: 29, caption: 'private on-site note' });
  for (let i = 0; i < 20; i++) await db.collection('activity_events').doc(randomUUID()).set({ recipient_id: viewer,
    post_id: postId, kind: 'place_note', anonymous: true, created_at: Timestamp.fromMillis(Date.now() - i * 1000) });
  let authorReads = 0, postReads = 0;
  const run = db.runTransaction.bind(db);
  t.mock.method(db, 'runTransaction', (update, ...options) => run(async tx => {
    const count = ref => { if (ref.path === `profiles/${author}`) authorReads++; if (ref.path === `posts/${postId}`) postReads++; };
    return update({ get: async ref => { count(ref); return tx.get(ref); },
      getAll: async (...refs) => { refs.forEach(count); return tx.getAll(...refs); } });
  }, ...options));
  const call = data => readActivity.run({ auth: { uid, token: { email_verified: true, firebase: { sign_in_provider: 'password' } } }, data });
  const first = await call({ pageSize: 15 });
  assert.equal(first.items.length, 15); assert.ok(first.next); assert.equal(authorReads, 1); assert.equal(postReads, 1);
  assert.equal(first.items.every(item => item.body === '' && item.actor_id === null), true);
  assert.equal(JSON.stringify(first).includes('private on-site note'), false);
  t.mock.restoreAll();
  const second = await call({ cursor: first.next, pageSize: 50 });
  assert.equal(second.items.length, 5); assert.equal(second.next, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 20);
  await db.collection('user_blocks').doc(`${viewer}_${author}`).set({ blocker_id: viewer, blocked_id: author });
  assert.equal((await call({ pageSize: 15 })).items.length, 15);
  await db.collection('anonymous_blocks').doc(`${viewer}_${author}`).set({ blocker_id: viewer, blocked_id: author });
  const hidden = await call({ pageSize: 15 });
  assert.deepEqual(hidden.items, []); assert.ok(hidden.next, 'a filtered page still advances');
});
