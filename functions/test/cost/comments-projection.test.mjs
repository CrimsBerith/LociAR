import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, getApp } from 'firebase-admin/app';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
const { readPublicContent } = await import('../../lib/publicContent.js');
after(async () => deleteApp(getApp()));

async function person() {
  const uid = randomUUID(), luid = luidForUid(uid);
  await db.collection('profiles').doc(luid).set({ handle: 'test', suspended: false });
  return { luid, call: data => readPublicContent.run({ auth: { uid, token: {} }, data }) };
}
async function post(author, extra = {}) {
  const id = randomUUID();
  await db.collection('posts').doc(id).set({ creator_id: author.luid, status: 'active', visibility: 'public', age_rating: 'all', ...extra });
  return id;
}
async function comment(postId, author, index) {
  const id = randomUUID();
  await db.collection('comments').doc(id).set({ post_id: postId, user_id: author.luid, username: 'author', text: `comment-${index}`, created_at: new Timestamp(1_800_000_000, index * 1_000_000) });
  return id;
}

test('comment pages filter bodies on the server and advance through an entirely blocked page with opaque scoped cursors', async () => {
  const viewer = await person(), hidden = await person(), visible = await person(), other = await person();
  const id = await post(visible);
  const expected = await comment(id, visible, 0);
  const hiddenIds = [];
  for (let i = 1; i <= 15; i++) hiddenIds.push(await comment(id, hidden, i));
  await db.collection('user_blocks').doc(`${hidden.luid}_${viewer.luid}`).set({ blocker_id: hidden.luid, blocked_id: viewer.luid });
  const first = await viewer.call({ mode: 'comments', postId: id });
  assert.deepEqual(first.comments, []); assert.ok(first.next);
  for (const hiddenId of hiddenIds) assert.equal(JSON.stringify(first).includes(hiddenId), false);
  assert.equal(JSON.stringify(first).includes('comment-15'), false);
  const next = await viewer.call({ mode: 'comments', postId: id, cursor: first.next });
  assert.deepEqual(next.comments.map(c => c.id), [expected]); assert.equal(next.next, null);
  await assert.rejects(other.call({ mode: 'comments', postId: id, cursor: first.next }), e => e.code === 'invalid-argument');
  const otherPost = await post(visible);
  await assert.rejects(viewer.call({ mode: 'comments', postId: otherPost, cursor: first.next }), e => e.code === 'invalid-argument');
  await db.collection('dense_spot_unlocks').doc(`${viewer.luid}_comments_${first.next}`).update({ expires_at: Timestamp.fromMillis(1) });
  await assert.rejects(viewer.call({ mode: 'comments', postId: id, cursor: first.next }), e => e.code === 'invalid-argument');
});

test('comment projection reaches all 201 rows without loss or duplicates', async () => {
  const viewer = await person(), author = await person(), id = await post(author);
  for (let i = 0; i < 201; i++) await comment(id, author, i);
  let cursor = null, loaded = [];
  do {
    const page = await viewer.call({ mode: 'comments', postId: id, cursor });
    loaded.push(...page.comments); cursor = page.next;
  } while (cursor);
  assert.equal(loaded.length, 201); assert.equal(new Set(loaded.map(c => c.id)).size, 201);
  assert.equal(loaded[0].text, 'comment-200'); assert.equal(loaded.at(-1).text, 'comment-0');
});

test('location comment reads require a live on-site grant; identity blocks and anonymous mutes remain independent', async () => {
  const viewer = await person(), author = await person(), commenter = await person();
  const id = await post(author, { is_anonymous: true, note_kind: 'location' });
  const cid = await comment(id, commenter, 1);
  const request = { mode: 'comments', postId: id };
  await assert.rejects(viewer.call(request), e => e.code === 'permission-denied');
  const grant = db.collection('dense_spot_unlocks').doc(`${viewer.luid}_note_${id}`);
  await grant.set({ kind: 'note_read', owner_luid: viewer.luid, expires_at: Timestamp.fromMillis(Date.now() + 60_000) });
  for (const collection of ['anonymous_blocks', 'user_blocks']) {
    await db.collection(collection).doc(`${viewer.luid}_${author.luid}`).set({ blocker_id: viewer.luid, blocked_id: author.luid });
  }
  assert.deepEqual((await viewer.call(request)).comments.map(c => c.id), [cid]);
  await db.collection('user_blocks').doc(`${viewer.luid}_${commenter.luid}`).set({ blocker_id: viewer.luid, blocked_id: commenter.luid });
  assert.deepEqual((await viewer.call(request)).comments, []);
  await grant.update({ expires_at: Timestamp.fromMillis(1) });
  await assert.rejects(viewer.call(request), e => e.code === 'permission-denied');
});
