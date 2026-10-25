import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, closeClients, newUser } from './_harness.mjs';
after(closeClients);

test('authenticated comment callable returns the iOS projection and removes blocked bodies before HTTP serialization', async () => {
  const viewer = await newUser(), author = await newUser(), hidden = await newUser();
  const postId = randomUUID(), visibleId = randomUUID(), hiddenId = randomUUID();
  await adminDb.collection('posts').doc(postId).set({ creator_id: author.luid,
    status: 'active', visibility: 'public', age_rating: 'all', created_at: Timestamp.now() });
  for (const [id, person, text] of [[visibleId, author, 'Readable comment'], [hiddenId, hidden, 'Hidden comment']]) {
    await adminDb.collection('comments').doc(id).set({ id, post_id: postId, user_id: person.luid,
      username: person.handle, text, created_at: Timestamp.now() });
  }
  const request = { mode: 'comments', postId };
  const before = await viewer.call('readPublicContent', request);
  assert.deepEqual(new Set(before.comments.map(c => c.id)), new Set([visibleId, hiddenId]));
  const visible = before.comments.find(c => c.id === visibleId);
  assert.equal(visible.post_id, postId); assert.equal(visible.user_id, author.luid);
  assert.equal(visible.text, 'Readable comment'); assert.ok(Number.isFinite(Date.parse(visible.created_at)));
  assert.equal(before.next, null);
  await adminDb.collection('user_blocks').doc(`${hidden.luid}_${viewer.luid}`).set({ blocker_id: hidden.luid, blocked_id: viewer.luid });
  const filtered = await viewer.call('readPublicContent', request);
  assert.deepEqual(filtered.comments.map(c => c.id), [visibleId]);
  assert.equal(JSON.stringify(filtered).includes('Hidden comment'), false);
  assert.equal(JSON.stringify(filtered).includes(hiddenId), false);
  await adminDb.collection('anonymous_blocks').doc(`${viewer.luid}_${author.luid}`).set({ blocker_id: viewer.luid, blocked_id: author.luid });
  assert.deepEqual((await viewer.call('readPublicContent', request)).comments.map(c => c.id), [visibleId]);
});
