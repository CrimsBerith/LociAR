import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Never permit a missed environment variable to contact the real project.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
assert.match(project ?? '', /^demo-[a-z0-9-]+$/);
const { db, Timestamp, luidForUid } = await import('../../lib/core.js');
const { readPublicContent } = await import('../../lib/publicContent.js');
const { readActivity } = await import('../../lib/anonymousAccess.js');
const { markActivityRead } = await import('../../lib/activity.js');
const { onLikeCreated, onFollowCreated, onCommentCreated, onProfileUpdated } = await import('../../lib/triggers.js');
assert.equal(db.projectId, project);
after(() => db.terminate());

const hash = value => createHash('sha256').update(value).digest('hex');
const account = () => { const uid = `acceptance-${randomUUID()}`; return { uid, luid: luidForUid(uid) }; };
const request = (user, data = {}) => ({ auth: { uid: user.uid, token: { luid: user.luid,
  email_verified: true, firebase: { sign_in_provider: 'password' } } }, data: { userId: user.luid, ...data } });
async function fixture(t) {
  const refs = new Map();
  const track = (name, id) => { const ref = db.collection(name).doc(id); refs.set(ref.path, ref); return ref; };
  const users = Array.from({ length: 4 }, account);
  for (const user of users) await track('profiles', user.luid).set({ handle: 'old_handle', suspended: false });
  t.after(async () => {
    t.mock.restoreAll();
    const batch = db.batch();
    for (const ref of refs.values()) batch.delete(ref);
    await batch.commit();
  });
  return { track, users };
}

test('51 anonymous profile posts are never fetched, projected or used as pagination anchors', async t => {
  const { track, users: [viewer, author] } = await fixture(t);
  const anonymousIds = new Set();
  for (let i = 0; i < 51; i++) {
    const id = randomUUID(); anonymousIds.add(id);
    await track('posts', id).set({ creator_id: author.luid, is_anonymous: true, status: 'active',
      visibility: 'public', age_rating: 'all', created_at: Timestamp.fromMillis(Date.now() - i), caption: `private-${id}` });
  }
  let postReads = 0;
  const inspect = docs => {
    for (const doc of docs) if (doc.exists && doc.ref.parent.id === 'posts') {
      postReads++;
      assert.equal(anonymousIds.has(doc.id), false, 'the DB returned an anonymous row before projection');
    }
  };
  const queryPrototype = Object.getPrototypeOf(db.collection('posts').where('creator_id', '==', author.luid));
  const queryGet = queryPrototype.get;
  t.mock.method(queryPrototype, 'get', async function (...args) {
    const page = await queryGet.apply(this, args); inspect(page.docs); return page;
  });
  const refPrototype = Object.getPrototypeOf(db.collection('posts').doc(randomUUID()));
  const refGet = refPrototype.get;
  t.mock.method(refPrototype, 'get', async function (...args) {
    const doc = await refGet.apply(this, args); inspect([doc]); return doc;
  });
  const getAll = db.getAll;
  t.mock.method(db, 'getAll', async function (...args) {
    const docs = await getAll.apply(this, args); inspect(docs); return docs;
  });
  const call = cursor => readPublicContent.run(request(viewer, { mode: 'creator', creatorId: author.luid, ...(cursor ? { cursor } : {}) }));
  assert.deepEqual(await call(), { posts: [], next: null });
  assert.equal(postReads, 0, 'anonymous documents are excluded in the database, not read then discarded');
  // Positive pagination control: public rows still advance through 50 + 1 results.
  const publicIds = [];
  for (let i = 0; i < 51; i++) {
    const id = randomUUID(); publicIds.push(id);
    await track('posts', id).set({ creator_id: author.luid, is_anonymous: false, status: 'active',
      visibility: 'public', age_rating: 'all', created_at: Timestamp.fromMillis(Date.now() - 1000 - i), caption: 'public' });
  }
  const first = await call(); assert.equal(first.posts.length, 50); assert.ok(first.next);
  const decoded = JSON.parse(Buffer.from(first.next, 'base64url').toString());
  assert.ok(publicIds.includes(decoded.id));
  for (const id of anonymousIds) assert.equal(JSON.stringify(first).includes(id), false);
  const second = await call(first.next); assert.equal(second.posts.length, 1); assert.equal(second.next, null);
  assert.deepEqual([...first.posts, ...second.posts].map(p => p.id).sort(), publicIds.sort());
});

test('like/follow activities publish opaque ids, deduplicate retries and conceal foreign versus missing rows', async t => {
  const { track, users: [outsider, actor, recipient, third] } = await fixture(t);
  const postId = randomUUID();
  await track('posts', postId).set({ creator_id: recipient.luid, is_anonymous: true, status: 'active', visibility: 'public', age_rating: 'all' });
  const like = { post_id: postId, user_id: actor.luid, created_at: Timestamp.now() };
  const likeRef = track('likes', `${postId}_${actor.luid}`); await likeRef.set(like);
  const follow = { follower_id: actor.luid, following_id: recipient.luid, created_at: Timestamp.now() };
  await track('follows', `${actor.luid}_${recipient.luid}`).set(follow);
  const likeKey = hash(`like_${postId}_${actor.luid}`), followKey = `follow_${actor.luid}_${recipient.luid}`;
  for (const key of [likeKey, followKey]) track('activity_keys', hash(key));
  for (const [trigger, data] of [[onLikeCreated, like], [onFollowCreated, follow]]) {
    const eventId = randomUUID(); track('trigger_receipts', eventId);
    const event = { id: eventId, data: { ref: likeRef, data: () => data } };
    await trigger.run(event); await trigger.run(event);
  }
  const rows = await db.collection('activity_events').where('recipient_id', '==', recipient.luid).get();
  for (const doc of rows.docs) track('activity_events', doc.id);
  assert.equal(rows.size, 2);
  const publicPage = await readActivity.run(request(recipient));
  assert.equal(publicPage.items.length, 2);
  const candidates = [actor.luid, recipient.luid, third.luid];
  for (const item of publicPage.items) {
    assert.match(item.id, /^act_[0-9a-f-]{36}$/);
    for (const candidate of candidates) {
      for (const predictable of [`like_${postId}_${candidate}`, hash(`like_${postId}_${candidate}`),
        `follow_${candidate}_${recipient.luid}`, hash(`follow_${candidate}_${recipient.luid}`)]) {
        assert.notEqual(item.id, predictable);
      }
      assert.equal(item.id.includes(candidate), false);
    }
    const before = (await db.collection('activity_events').doc(item.id).get()).data();
    const foreign = await markActivityRead.run(request(outsider, { activityIds: [item.id] }));
    const missing = await markActivityRead.run(request(outsider, { activityIds: [`act_${randomUUID()}`] }));
    assert.deepEqual(foreign, missing); assert.deepEqual(foreign, { activities: [] });
    assert.deepEqual((await db.collection('activity_events').doc(item.id).get()).data(), before);
  }
  assert.equal(publicPage.items.find(item => item.kind === 'like').actor_id, null);
  // Legacy rows also get a stable opaque reference, including after marking read.
  for (const id of [likeKey, followKey]) await track('activity_events', id).set({ kind: id === likeKey ? 'like' : 'follow',
    actor_id: actor.luid, recipient_id: recipient.luid, anonymous: id === likeKey, body: 'legacy', created_at: Timestamp.now(), read_at: null });
  const legacyPage = await readActivity.run(request(recipient));
  assert.ok(legacyPage.items.every(item => item.id.startsWith('act_')));
  assert.deepEqual(await readActivity.run(request(recipient)), legacyPage, 'legacy public references remain stable');
  for (const id of [likeKey, followKey]) {
    const saved = await db.collection('activity_events').doc(id).get();
    const rawForeign = await markActivityRead.run(request(outsider, { activityIds: [id] }));
    const rawMissing = await markActivityRead.run(request(outsider, { activityIds: [id === likeKey
      ? hash(`like_${postId}_${third.luid}`) : `follow_${third.luid}_${recipient.luid}`] }));
    assert.deepEqual(rawForeign, rawMissing, 'legacy predictable ids cannot reveal foreign existence');
    const foreign = await markActivityRead.run(request(outsider, { activityIds: [saved.get('public_ref')] }));
    assert.deepEqual(foreign, { activities: [] });
    const marked = await markActivityRead.run(request(recipient, { activityIds: [saved.get('public_ref')] }));
    assert.equal(marked.activities[0].id, saved.get('public_ref'));
    assert.ok((await saved.ref.get()).get('read_at'));
  }
});

test('delayed onCommentCreated uses the live new_handle after profile rename fanout', async t => {
  const { track, users: [author] } = await fixture(t);
  const postId = randomUUID(), commentId = randomUUID(), eventId = randomUUID();
  await track('posts', postId).set({ creator_id: author.luid, is_anonymous: false, status: 'active', visibility: 'public', age_rating: 'all' });
  const comment = { user_id: author.luid, post_id: postId, text: 'A safe comment', username: 'old_handle', created_at: Timestamp.now() };
  const ref = track('comments', commentId); await ref.set(comment);
  const staleDelivery = await ref.get();
  const profile = track('profiles', author.luid), before = (await profile.get()).data();
  track('account_access', author.luid); track('trigger_receipts', eventId);
  const runTransaction = db.runTransaction;
  let renameBeforeFirstTransaction = true, injected = false;
  t.mock.method(db, 'runTransaction', async function (...args) {
    if (renameBeforeFirstTransaction) {
      renameBeforeFirstTransaction = false;
      await profile.update({ handle: 'new_handle' });
      await onProfileUpdated.run({ id: randomUUID(), params: { luid: author.luid }, data: {
        before: { data: () => before }, after: { data: () => ({ ...before, handle: 'new_handle' }) } } });
      assert.equal((await ref.get()).get('username'), 'new_handle');
      injected = true;
    }
    return runTransaction.apply(this, args);
  });
  // Rename and its fanout commit between the handler starting and its first transaction.
  // A pre-transaction profile read would retain old_handle and overwrite that fanout.
  await onCommentCreated.run({ id: eventId, params: { id: commentId }, data: staleDelivery });
  assert.equal(injected, true, 'the controlled rename interleaving must execute');
  assert.equal((await ref.get()).get('username'), 'new_handle');
  await onCommentCreated.run({ id: eventId, params: { id: commentId }, data: staleDelivery });
  assert.equal((await ref.get()).get('username'), 'new_handle', 'redelivery also retains the latest handle');
  assert.equal((await profile.get()).get('handle'), 'new_handle');
});
