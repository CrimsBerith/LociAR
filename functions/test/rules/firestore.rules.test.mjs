import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

const ALICE = '11111111-1111-5111-8111-111111111111';
const BOB = '22222222-2222-5222-8222-222222222222';
const POST = '33333333-3333-4333-8333-333333333333';
const PENDING = '44444444-4444-4444-8444-444444444444';
const PRIVATE = '55555555-5555-4555-8555-555555555555';
const CAROL = '66666666-6666-5666-8666-666666666666'; // suspended
const DAVE = '77777777-7777-5777-8777-777777777777'; // blocked by BOB
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lociar',
    firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'posts', POST), { creator_id: BOB, status: 'active', visibility: 'public', age_rating: 'all' });
    await setDoc(doc(db, 'posts', PENDING), { creator_id: BOB, status: 'pending_review', visibility: 'public', age_rating: 'all' });
    await setDoc(doc(db, 'posts', PRIVATE), { creator_id: BOB, status: 'active', visibility: 'private', age_rating: 'all' });
    await setDoc(doc(db, 'profiles', ALICE), { handle: 'alice', avatar_url: null, bio: null, follower_count: 0, suspended: false });
    await setDoc(doc(db, 'profiles', BOB), { handle: 'bob', avatar_url: null, bio: null, follower_count: 0 });
    await setDoc(doc(db, 'profiles', CAROL), { handle: 'carol', avatar_url: null, bio: null, follower_count: 0, suspended: true });
    await setDoc(doc(db, 'profiles', DAVE), { handle: 'dave', avatar_url: null, bio: null, follower_count: 0 });
    await setDoc(doc(db, 'user_blocks', `${BOB}_${DAVE}`), { blocker_id: BOB, blocked_id: DAVE });
    await setDoc(doc(db, 'comments', 'bob-own'), { id: 'bob-own', post_id: POST, user_id: DAVE, username: 'dave', text: 'x' });
    await setDoc(doc(db, 'collections', 'c1'), { id: 'c1', owner_id: BOB, title: 'x', visibility: 'private' });
  });
});

const as = (luid) => env.authenticatedContext(`uid-${luid}`, { luid }).firestore();

test('anyone reads active public posts; pending only by creator', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'posts', POST)));
  await assertFails(getDoc(doc(anon, 'posts', PENDING)));
  await assertFails(getDoc(doc(as(ALICE), 'posts', PENDING)));
  await assertSucceeds(getDoc(doc(as(BOB), 'posts', PENDING)));
  await assertSucceeds(getDocs(query(collection(anon, 'posts'), where('status', '==', 'active'), where('visibility', '==', 'public'))));
  await assertFails(getDocs(query(collection(anon, 'posts'), where('status', '==', 'pending_review'))));
  await assertSucceeds(getDocs(query(collection(as(BOB), 'posts'), where('creator_id', '==', BOB))));
});

test('clients can never write posts directly', async () => {
  await assertFails(setDoc(doc(as(BOB), 'posts', 'new'), { creator_id: BOB, status: 'active' }));
  await assertFails(updateDoc(doc(as(BOB), 'posts', PENDING), { status: 'active' }));
});

test('likes: only own identity, correct id, existing post', async () => {
  const db = as(ALICE);
  await assertSucceeds(setDoc(doc(db, 'likes', `${POST}_${ALICE}`), { post_id: POST, user_id: ALICE, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'likes', `${POST}_${BOB}`), { post_id: POST, user_id: BOB, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'likes', `x_${ALICE}`), { post_id: POST, user_id: ALICE, created_at: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as(BOB), 'likes', `${POST}_${ALICE}`)));
  await assertSucceeds(deleteDoc(doc(db, 'likes', `${POST}_${ALICE}`)));
});

test('comments only on active posts, with caller identity', async () => {
  const db = as(ALICE);
  const c = { id: 'c-1', post_id: POST, user_id: ALICE, username: 'alice', text: 'selam', created_at: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'comments', 'c-1'), c));
  await assertFails(setDoc(doc(db, 'comments', 'c-2'), { ...c, id: 'c-2', user_id: BOB }));
  await assertFails(setDoc(doc(db, 'comments', 'c-3'), { ...c, id: 'c-3', post_id: PENDING }));
  await assertFails(setDoc(doc(db, 'comments', 'c-4'), { ...c, id: 'c-4', text: 'x'.repeat(501) }));
});

test('follows and blocks cannot target self or impersonate', async () => {
  const db = as(ALICE);
  await assertSucceeds(setDoc(doc(db, 'follows', `${ALICE}_${BOB}`), { follower_id: ALICE, following_id: BOB, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'follows', `${ALICE}_${ALICE}`), { follower_id: ALICE, following_id: ALICE, created_at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'user_blocks', `${ALICE}_${BOB}`), { blocker_id: ALICE, blocked_id: BOB, created_at: serverTimestamp() }));
  await assertFails(getDocs(query(collection(as(BOB), 'user_blocks'), where('blocked_id', '==', BOB))));
});

test('profile: owner edits bio/preset only; handle and photo avatar are server-only', async () => {
  const db = as(ALICE);
  await assertSucceeds(updateDoc(doc(db, 'profiles', ALICE), { bio: 'merhaba', updated_at: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'profiles', ALICE), { avatar_preset: 'hare', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', ALICE), { avatar_preset: 'https://x.example/a.jpg', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', ALICE), { handle: 'bob', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', ALICE), { avatar_url: 'https://x.example/a.jpg', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', ALICE), { suspended: true, updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', ALICE), { follower_count: 999, updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(BOB), 'profiles', ALICE), { bio: 'hacked', updated_at: serverTimestamp() }));
  await assertFails(getDoc(doc(db, 'handles', 'alice')));
});

test('suspended accounts cannot interact but can still report', async () => {
  const db = as(CAROL);
  const c = { id: 'c-s', post_id: POST, user_id: CAROL, username: 'carol', text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'comments', 'c-s'), c));
  await assertFails(setDoc(doc(db, 'likes', `${POST}_${CAROL}`), { post_id: POST, user_id: CAROL, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'follows', `${CAROL}_${BOB}`), { follower_id: CAROL, following_id: BOB, created_at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'r-s'), { post_id: POST, user_id: CAROL, reason: 'spam', status: 'open', metadata: {}, created_at: serverTimestamp() }));
});

test('blocked users cannot comment, like or follow the blocker', async () => {
  const db = as(DAVE);
  const c = { id: 'c-b', post_id: POST, user_id: DAVE, username: 'dave', text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'comments', 'c-b'), c));
  await assertFails(setDoc(doc(db, 'likes', `${POST}_${DAVE}`), { post_id: POST, user_id: DAVE, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'follows', `${DAVE}_${BOB}`), { follower_id: DAVE, following_id: BOB, created_at: serverTimestamp() }));
});

test('comments: not on private posts; author or post owner may delete', async () => {
  const c = { id: 'c-p', post_id: PRIVATE, user_id: ALICE, username: 'alice', text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(as(ALICE), 'comments', 'c-p'), c));
  await assertSucceeds(setDoc(doc(as(ALICE), 'comments', 'c-a'), { ...c, id: 'c-a', post_id: POST }));
  await assertFails(deleteDoc(doc(as(DAVE), 'comments', 'c-a')));
  await assertSucceeds(deleteDoc(doc(as(ALICE), 'comments', 'c-a')));
  await assertSucceeds(deleteDoc(doc(as(BOB), 'comments', 'bob-own')));
});

test('collection items only in own collections; reports create-only', async () => {
  const db = as(ALICE);
  await assertFails(setDoc(doc(db, 'collection_items', `c1_${POST}`), { collection_id: 'c1', post_id: POST, owner_id: ALICE, sort_order: 1, created_at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'r1'), { post_id: POST, user_id: ALICE, reason: 'spam', status: 'open', metadata: { source: 'native_ios' }, created_at: serverTimestamp() }));
  await assertFails(getDoc(doc(db, 'moderation_flags', 'r1')));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'r2'), { post_id: POST, user_id: ALICE, reason: 'spam', status: 'resolved', metadata: {}, created_at: serverTimestamp() }));
});

test('server-only collections are closed', async () => {
  await assertFails(getDoc(doc(as(ALICE), 'analytics_events', 'x')));
  await assertFails(setDoc(doc(as(ALICE), 'admin_audit_log', 'x'), { a: 1 }));
  await assertFails(getDoc(doc(as(ALICE), 'users_private', BOB)));
});
