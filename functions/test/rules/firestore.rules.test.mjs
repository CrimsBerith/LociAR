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
    await setDoc(doc(db, 'comments', 'bob-own'), { id: 'bob-own', post_id: POST, user_id: DAVE, text: 'x' });
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
  const c = { id: 'c-1', post_id: POST, user_id: ALICE, text: 'selam', created_at: serverTimestamp() };
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

test('profile: an over-long legacy display_name does not block other edits', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'profiles', BOB), { handle: 'bob', avatar_url: null, bio: null, display_name: 'x'.repeat(70), suspended: false });
  });
  const db = env.authenticatedContext('uid-bob', { luid: BOB }).firestore();
  await assertSucceeds(updateDoc(doc(db, 'profiles', BOB), { bio: 'merhaba', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'profiles', BOB), { display_name: 'y'.repeat(61), updated_at: serverTimestamp() }));
});

test('suspended accounts cannot interact but can still report', async () => {
  const db = as(CAROL);
  const c = { id: 'c-s', post_id: POST, user_id: CAROL, text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'comments', 'c-s'), c));
  await assertFails(setDoc(doc(db, 'likes', `${POST}_${CAROL}`), { post_id: POST, user_id: CAROL, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'follows', `${CAROL}_${BOB}`), { follower_id: CAROL, following_id: BOB, created_at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'r-s'), { post_id: POST, user_id: CAROL, reason: 'spam', status: 'open', metadata: {}, created_at: serverTimestamp() }));
});

test('blocked users cannot comment, like or follow the blocker', async () => {
  const db = as(DAVE);
  const c = { id: 'c-b', post_id: POST, user_id: DAVE, text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'comments', 'c-b'), c));
  await assertFails(setDoc(doc(db, 'likes', `${POST}_${DAVE}`), { post_id: POST, user_id: DAVE, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'follows', `${DAVE}_${BOB}`), { follower_id: DAVE, following_id: BOB, created_at: serverTimestamp() }));
});

test('comments: not on private posts; author or post owner may delete', async () => {
  const c = { id: 'c-p', post_id: PRIVATE, user_id: ALICE, text: 'selam', created_at: serverTimestamp() };
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

test('comments/likes/follows are not readable without signing in; removed posts expose no comments', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'posts', 'removed-post'), { creator_id: BOB, status: 'removed', visibility: 'public', age_rating: 'all' });
    await setDoc(doc(db, 'comments', 'c-removed'), { id: 'c-removed', post_id: 'removed-post', user_id: ALICE, text: 'x' });
    await setDoc(doc(db, 'likes', `${POST}_${ALICE}`), { post_id: POST, user_id: ALICE });
    await setDoc(doc(db, 'follows', `${ALICE}_${BOB}`), { follower_id: ALICE, following_id: BOB });
  });
  await assertFails(getDocs(query(collection(anon, 'comments'), where('post_id', '==', POST))));
  await assertFails(getDoc(doc(anon, 'likes', `${POST}_${ALICE}`)));
  await assertFails(getDoc(doc(anon, 'follows', `${ALICE}_${BOB}`)));
  await assertSucceeds(getDocs(query(collection(as(ALICE), 'comments'), where('post_id', '==', POST))));
  await assertFails(getDocs(query(collection(as(ALICE), 'comments'), where('post_id', '==', 'removed-post'))));
  await assertSucceeds(getDoc(doc(as(ALICE), 'likes', `${POST}_${ALICE}`)));
  await assertSucceeds(getDoc(doc(as(ALICE), 'follows', `${ALICE}_${BOB}`)));
});

test('comments cannot carry a client-written username', async () => {
  const c = { id: 'c-u', post_id: POST, user_id: ALICE, username: 'spoofed', text: 'selam', created_at: serverTimestamp() };
  await assertFails(setDoc(doc(as(ALICE), 'comments', 'c-u'), c));
});

test('post_saves: only public active posts; owner-only reads and deletes', async () => {
  const db = as(ALICE);
  await assertSucceeds(setDoc(doc(db, 'post_saves', `${ALICE}_${POST}`), { post_id: POST, user_id: ALICE, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'post_saves', `${ALICE}_${PENDING}`), { post_id: PENDING, user_id: ALICE, created_at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, 'post_saves', `${ALICE}_${POST}`)));
  await assertFails(getDoc(doc(as(BOB), 'post_saves', `${ALICE}_${POST}`)));
  await assertFails(deleteDoc(doc(as(BOB), 'post_saves', `${ALICE}_${POST}`)));
  await assertSucceeds(deleteDoc(doc(db, 'post_saves', `${ALICE}_${POST}`)));
});

test('follows require an existing target profile', async () => {
  await assertFails(setDoc(doc(as(ALICE), 'follows', `${ALICE}_ghost`), { follower_id: ALICE, following_id: 'ghost', created_at: serverTimestamp() }));
});

test('collections: validated create and update, owner-only CRUD', async () => {
  const db = as(ALICE);
  const base = { id: 'c-ok', owner_id: ALICE, title: 'Favoriler', description: 'x', visibility: 'private', created_at: serverTimestamp(), updated_at: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'collections', 'c-ok'), base));
  await assertFails(setDoc(doc(db, 'collections', 'c-long'), { ...base, id: 'c-long', description: 'x'.repeat(501) }));
  await assertFails(setDoc(doc(db, 'collections', 'c-vis'), { ...base, id: 'c-vis', visibility: 'friends' }));
  await assertSucceeds(updateDoc(doc(db, 'collections', 'c-ok'), { title: 'Yeni', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'collections', 'c-ok'), { title: '', updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'collections', 'c-ok'), { description: 'x'.repeat(501), updated_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'collections', 'c-ok'), { visibility: 'secret', updated_at: serverTimestamp() }));
  await assertFails(getDoc(doc(as(BOB), 'collections', 'c-ok')));
  await assertFails(deleteDoc(doc(as(BOB), 'collections', 'c-ok')));
  await assertSucceeds(deleteDoc(doc(db, 'collections', 'c-ok')));
});

test('moderation_flags: bounded metadata and typed post_id', async () => {
  const db = as(ALICE);
  const flag = { post_id: POST, user_id: ALICE, reason: 'spam', status: 'open', metadata: {}, created_at: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'f-ok'), flag));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'f-meta'), { ...flag, metadata: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i])) }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'f-type'), { ...flag, post_id: 12345 }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'f-user'), { ...flag, user_id: BOB }));
});

test('moderation_flags: metadata keys are known and every value is a string of at most 500 characters', async () => {
  const db = as(ALICE);
  const flag = { post_id: POST, user_id: ALICE, reason: 'spam', status: 'open', created_at: serverTimestamp() };
  const comment = { source: 'native_ios', target: 'comment', comment_id: 'c', author_id: BOB, text: 'x'.repeat(500) };
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'm-ok'), { ...flag, metadata: comment }));
  await assertSucceeds(setDoc(doc(db, 'moderation_flags', 'm-user'), { ...flag, post_id: null, metadata: { source: 'native_ios', target: 'user', reported_user_id: BOB } }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'm-long'), { ...flag, metadata: { ...comment, text: 'x'.repeat(501) } }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'm-huge'), { ...flag, metadata: { source: 'y'.repeat(900_000) } }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'm-key'), { ...flag, metadata: { payload: 'x' } }));
  await assertFails(setDoc(doc(db, 'moderation_flags', 'm-type'), { ...flag, metadata: { source: { nested: 'x' } } }));
});

test('collection_items: the post must exist and be visible to the saver', async () => {
  const db = as(BOB);
  const item = (postId) => ({ collection_id: 'c1', post_id: postId, owner_id: BOB, sort_order: 1, created_at: serverTimestamp() });
  const missing = '99999999-9999-4999-8999-999999999999';
  await assertFails(setDoc(doc(db, 'collection_items', `c1_${missing}`), item(missing)));
  await assertSucceeds(setDoc(doc(db, 'collection_items', `c1_${POST}`), item(POST)));
  // Someone else's pending / private posts cannot be collected.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'posts', 'alice-pending'), { creator_id: ALICE, status: 'pending_review', visibility: 'public' });
    await setDoc(doc(ctx.firestore(), 'posts', 'bob-pending'), { creator_id: BOB, status: 'pending_review', visibility: 'public' });
  });
  await assertFails(setDoc(doc(db, 'collection_items', 'c1_alice-pending'), item('alice-pending')));
  await assertSucceeds(setDoc(doc(db, 'collection_items', 'c1_bob-pending'), item('bob-pending')));
});

test('collections: timestamps must be server time', async () => {
  const db = as(BOB);
  const base = { id: 'c-ts', owner_id: BOB, title: 'T', description: null, visibility: 'private' };
  await assertFails(setDoc(doc(db, 'collections', 'c-ts'), { ...base, created_at: new Date(0), updated_at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'collections', 'c-ts'), { ...base, created_at: serverTimestamp(), updated_at: serverTimestamp() }));
});

test('activity_events: recipient reads and marks read; nothing else', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'activity_events', 'a1'), { id: 'a1', recipient_id: ALICE, actor_id: BOB, kind: 'like', read_at: null });
  });
  await assertSucceeds(getDoc(doc(as(ALICE), 'activity_events', 'a1')));
  await assertFails(getDoc(doc(as(BOB), 'activity_events', 'a1')));
  await assertSucceeds(updateDoc(doc(as(ALICE), 'activity_events', 'a1'), { read_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(ALICE), 'activity_events', 'a1'), { body: 'hacked' }));
  await assertFails(deleteDoc(doc(as(ALICE), 'activity_events', 'a1')));
  await assertFails(setDoc(doc(as(ALICE), 'activity_events', 'a2'), { id: 'a2', recipient_id: ALICE }));
});

test('user_blocks: only the blocker reads; protected_zones are public read-only', async () => {
  await assertSucceeds(getDocs(query(collection(as(BOB), 'user_blocks'), where('blocker_id', '==', BOB))));
  await assertFails(getDocs(query(collection(as(DAVE), 'user_blocks'), where('blocker_id', '==', BOB))));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'protected_zones', 'z1'), { name: 'Z', lat: 1, lng: 2, radius_meters: 10, active: true });
  });
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'protected_zones', 'z1')));
  await assertFails(setDoc(doc(as(ALICE), 'protected_zones', 'z2'), { name: 'Z' }));
});

test('server-only collections stay closed for clients (reads and writes)', async () => {
  for (const name of ['handles', 'arcore_token_quota', 'media_purge_queue', 'post_view_receipts', 'avatar_reviews', 'cloud_anchors', 'cloud_anchor_deletions', 'post_quota', 'trigger_receipts', 'system', 'avatar_uploads', 'anchor_quota', 'filtered_comments', 'account_deletions', 'admin_audit', 'admin_invites', 'push_devices', 'push_quota']) {
    await assertFails(getDoc(doc(as(ALICE), name, 'x')));
    await assertFails(setDoc(doc(as(ALICE), name, 'x'), { owner_luid: ALICE }));
  }
});
