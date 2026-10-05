import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';

const ALICE = '11111111-1111-5111-8111-111111111111';
const BOB = '22222222-2222-5222-8222-222222222222';
const CAROL = '66666666-6666-5666-8666-666666666666';
const OLD_POST = '33333333-3333-4333-8333-333333333333';
const NEW_POST = '44444444-4444-4444-8444-444444444444';
const OWN_POST = '55555555-5555-4555-8555-555555555555';
const AVATAR_SLOT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const mapPath = `post-world-maps/${ALICE}/${OLD_POST}/existing.lociarmap`;
const legacyPaths = [
  `post-layer-assets/${ALICE}/old/image.jpg`,
  `post-video-assets/${ALICE}/old/video.mp4`,
  `post-reference-images/${ALICE}/old/image.jpg`,
  `post-surface-textures/${ALICE}/old/image.jpg`,
];
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lociar',
    firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [luid, handle] of [[ALICE, 'alice'], [BOB, 'bob'], [CAROL, 'carol']]) {
      await setDoc(doc(db, 'profiles', luid), { handle, suspended: false, deleted_at: null, avatar_url: null });
      await setDoc(doc(db, 'account_access', luid), { state: 'active' });
    }
    for (const postId of [OLD_POST, NEW_POST, OWN_POST]) {
      await setDoc(doc(db, 'posts', postId), { creator_id: postId === OWN_POST ? ALICE : BOB, status: 'active', visibility: 'public' });
    }
    await setDoc(doc(db, 'likes', `${OLD_POST}_${ALICE}`), { post_id: OLD_POST, user_id: ALICE });
    await setDoc(doc(db, 'post_saves', `${ALICE}_${OLD_POST}`), { post_id: OLD_POST, user_id: ALICE });
    await setDoc(doc(db, 'follows', `${ALICE}_${BOB}`), { follower_id: ALICE, following_id: BOB });
    await setDoc(doc(db, 'user_blocks', `${ALICE}_${BOB}`), { blocker_id: ALICE, blocked_id: BOB });
    await setDoc(doc(db, 'comments', 'old-own-comment'), { id: 'old-own-comment', user_id: ALICE, post_id: OLD_POST, text: 'Existing comment' });
    await setDoc(doc(db, 'comments', 'old-other-comment'), { id: 'old-other-comment', user_id: BOB, post_id: OWN_POST, text: 'Existing comment' });
    await setDoc(doc(db, 'collections', 'existing'), { id: 'existing', owner_id: ALICE, title: 'Existing', visibility: 'private' });
    await setDoc(doc(db, 'collection_items', `existing_${OLD_POST}`), { collection_id: 'existing', post_id: OLD_POST, owner_id: ALICE, sort_order: 0 });
    await setDoc(doc(db,'storage_reclamations',NEW_POST),{creator_id:ALICE,state:'draft'});
    // An already granted upload slot must not let an accepted deletion be bypassed.
    await setDoc(doc(db, 'avatar_uploads', AVATAR_SLOT), { luid: ALICE, expires_at: new Date(Date.now() + 15 * 60_000) });
    for (const path of [mapPath, ...legacyPaths]) {
      await uploadBytes(ref(ctx.storage(), path), jpeg, { contentType: path === mapPath ? 'application/x-lociarmap' : 'image/jpeg' });
    }
  });
});

const as = luid => env.authenticatedContext(`uid-${luid}`, { luid });
const aliceDb = () => as(ALICE).firestore();
const aliceStorage = () => as(ALICE).storage();
async function tombstone(luid, status) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_jobs', luid), {
      uid: `uid-${luid}`, luid, status,
      ...(status === 'pending' ? { next_at: new Date() } : { done_at: new Date() }),
    });
    await setDoc(doc(ctx.firestore(), 'account_access', luid), { state: status === 'done' ? 'done' : 'deleting' });
  });
}
const surfaces = {
  'profile updates': () => [
    () => updateDoc(doc(aliceDb(), 'profiles', ALICE), { bio: 'Still active', updated_at: serverTimestamp() }),
  ],
  'likes': () => [
    () => setDoc(doc(aliceDb(), 'likes', `${NEW_POST}_${ALICE}`), { post_id: NEW_POST, user_id: ALICE, created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'likes', `${OLD_POST}_${ALICE}`)),
  ],
  'saves': () => [
    () => setDoc(doc(aliceDb(), 'post_saves', `${ALICE}_${NEW_POST}`), { post_id: NEW_POST, user_id: ALICE, created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'post_saves', `${ALICE}_${OLD_POST}`)),
  ],
  'follows': () => [
    () => setDoc(doc(aliceDb(), 'follows', `${ALICE}_${CAROL}`), { follower_id: ALICE, following_id: CAROL, created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'follows', `${ALICE}_${BOB}`)),
  ],
  'blocks': () => [
    () => setDoc(doc(aliceDb(), 'user_blocks', `${ALICE}_${CAROL}`), { blocker_id: ALICE, blocked_id: CAROL, created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'user_blocks', `${ALICE}_${BOB}`)),
  ],
  'comments, including moderation by the post owner': () => [
    () => setDoc(doc(aliceDb(), 'comments', 'new-comment'), { id: 'new-comment', user_id: ALICE, post_id: NEW_POST, text: 'Valid comment', created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'comments', 'old-own-comment')),
    () => deleteDoc(doc(aliceDb(), 'comments', 'old-other-comment')),
  ],
  'collection creation, updates and deletion': () => [
    () => setDoc(doc(aliceDb(), 'collections', 'new'), { id: 'new', owner_id: ALICE, title: 'New', visibility: 'private', created_at: serverTimestamp(), updated_at: serverTimestamp() }),
    () => updateDoc(doc(aliceDb(), 'collections', 'existing'), { title: 'Updated', updated_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'collections', 'existing')),
  ],
  'collection item creation and deletion': () => [
    () => setDoc(doc(aliceDb(), 'collection_items', `existing_${NEW_POST}`), { collection_id: 'existing', post_id: NEW_POST, owner_id: ALICE, sort_order: 1, created_at: serverTimestamp() }),
    () => deleteDoc(doc(aliceDb(), 'collection_items', `existing_${OLD_POST}`)),
  ],
  'report creation': () => [
    () => setDoc(doc(aliceDb(), 'moderation_flags', 'new-report'), { post_id: NEW_POST, user_id: ALICE, reason: 'spam', status: 'open', metadata: { source: 'native_ios' }, created_at: serverTimestamp() }),
  ],
  'world-map creation, updates and deletion': () => [
    () => uploadBytes(ref(aliceStorage(), `post-world-maps/${ALICE}/${NEW_POST}/new.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }),
    () => uploadBytes(ref(aliceStorage(), mapPath), jpeg, { contentType: 'application/x-lociarmap' }),
    () => deleteObject(ref(aliceStorage(), mapPath)),
  ],
  'avatar uploads with a previously granted slot': () => [
    () => uploadBytes(ref(aliceStorage(), `avatars/${ALICE}/pending/${AVATAR_SLOT}.jpg`), jpeg, { contentType: 'image/jpeg' }),
  ],
  'legacy Storage deletions': () => legacyPaths.map(path => () => deleteObject(ref(aliceStorage(), path))),
};

for (const status of ['pending', 'done']) {
  for (const [name, operations] of Object.entries(surfaces)) {
    test(`accepted ${status} account deletion blocks ${name} even while the profile and token remain`, async () => {
      await tombstone(ALICE, status);
      for (const operation of operations()) await assertFails(operation());
    });
  }
  test(`${status} deletion also prevents another active user following that account`, async () => {
    await tombstone(BOB, status);
    await assertFails(setDoc(doc(as(CAROL).firestore(), 'follows', `${CAROL}_${BOB}`), { follower_id: CAROL, following_id: BOB, created_at: serverTimestamp() }));
  });
}

test('an active account with no deletion job can still use every writable owner surface', async () => {
  // Exercise collection items before deleting the containing collection.
  const ordered = [surfaces['collection item creation and deletion'], ...Object.entries(surfaces).filter(([name]) => name !== 'collection item creation and deletion').map(([, value]) => value)];
  for (const operations of ordered) {
    await env.withSecurityRulesDisabled(async ctx => {
      await deleteDoc(doc(ctx.firestore(),'user_blocks',`${ALICE}_${BOB}`));
      await deleteDoc(doc(ctx.firestore(),'user_blocks',`${ALICE}_${CAROL}`));
    });
    if (operations === surfaces['world-map creation, updates and deletion']) {
      await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(),'storage_reclamations',OLD_POST),{state:'draft',creator_id:ALICE}));
      const [create, overwrite, remove] = operations();
      await assertSucceeds(create()); await assertFails(overwrite()); await assertSucceeds(remove());
    } else for (const operation of operations()) await assertSucceeds(operation());
  }
});

test('account deletion job data and its permanent gate cannot be read, created, changed or removed by clients', async () => {
  await tombstone(ALICE, 'done');
  for (const ctx of [as(ALICE), as(BOB), env.unauthenticatedContext()]) {
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, 'account_deletion_jobs', ALICE)));
    await assertFails(getDocs(collection(db, 'account_deletion_jobs')));
    await assertFails(updateDoc(doc(db, 'account_deletion_jobs', ALICE), { status: 'pending' }));
    await assertFails(deleteDoc(doc(db, 'account_deletion_jobs', ALICE)));
    await assertFails(setDoc(doc(db, 'account_deletion_jobs', CAROL), { luid: CAROL, status: 'pending' }));
    await assertFails(getDoc(doc(db, 'account_access', ALICE)));
    await assertFails(updateDoc(doc(db, 'account_access', ALICE), { state: 'active' }));
    await assertFails(deleteDoc(doc(db, 'account_access', ALICE)));
    await assertFails(setDoc(doc(db, 'account_access', CAROL), { state: 'active' }));
  }
});

test('a stale token without a profile or access record cannot write owner resources, even without a deletion job', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await deleteDoc(doc(ctx.firestore(), 'profiles', ALICE));
    await deleteDoc(doc(ctx.firestore(), 'account_access', ALICE));
  });
  for (const [name, operations] of Object.entries(surfaces)) {
    // A missing profile update is inherently invalid; the other surfaces prove the shared gate.
    if (name === 'profile updates') continue;
    for (const operation of operations()) await assertFails(operation());
  }
});

test('a profile marked deleted blocks owner writes before a deletion worker removes it', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'profiles', ALICE), { deleted_at: new Date() });
    await setDoc(doc(ctx.firestore(), 'account_access', ALICE), { state: 'deleting' });
  });
  for (const operations of Object.values(surfaces)) for (const operation of operations()) await assertFails(operation());
});

test('an active account cannot follow a profile already marked deleted, without relying on a job', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'profiles', BOB), { deleted_at: new Date() }));
  await assertFails(setDoc(doc(as(CAROL).firestore(), 'follows', `${CAROL}_${BOB}`), { follower_id: CAROL, following_id: BOB, created_at: serverTimestamp() }));
});
