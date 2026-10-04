import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const ALICE = '11111111-1111-5111-8111-111111111111';
const BOB = '22222222-2222-5222-8222-222222222222';
const ACTIVE = '33333333-3333-4333-8333-333333333333';
const PENDING = '44444444-4444-4444-8444-444444444444';
const FRIENDS = '55555555-5555-4555-8555-555555555555';
const PRIVATE = '66666666-6666-4666-8666-666666666666';
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lociar',
    storage: { rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8') },
    firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'posts', ACTIVE), { creator_id: ALICE, status: 'active', visibility: 'public' });
    await setDoc(doc(ctx.firestore(), 'posts', PENDING), { creator_id: ALICE, status: 'pending_review', visibility: 'public' });
    await setDoc(doc(ctx.firestore(), 'posts', FRIENDS), { creator_id: ALICE, status: 'active', visibility: 'friends' });
    await setDoc(doc(ctx.firestore(), 'posts', PRIVATE), { creator_id: ALICE, status: 'active', visibility: 'private' });
  });
});
after(async () => env?.cleanup());
const as = (luid) => env.authenticatedContext(`uid-${luid}`, { luid }).storage();
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test('owners upload into their own folder only', async () => {
  await assertSucceeds(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/${ACTIVE}/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${BOB}/${ACTIVE}/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/${ACTIVE}/anchor.exe`), jpeg, { contentType: 'application/octet-stream' }));
});

test('photo/video post uploads are closed (text + social links only)', async () => {
  await assertFails(uploadBytes(ref(as(ALICE), `post-layer-assets/${ALICE}/p1/layers/a.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-video-assets/${ALICE}/p1/v.mp4`), jpeg, { contentType: 'video/mp4' }));
});

test('surface texture upload denied', async () => {
  await assertFails(uploadBytes(ref(as(ALICE), `post-surface-textures/${ALICE}/p1/t.jpg`), jpeg, { contentType: 'image/jpeg' }));
});

test('world maps: readable for active posts (signed in) and always by the owner; never for pending posts of others', async () => {
  const seed = async (postId) => env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), `post-world-maps/${ALICE}/${postId}/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' });
  });
  await seed(ACTIVE);
  await seed(PENDING);
  await assertSucceeds(getBytes(ref(as(BOB), `post-world-maps/${ALICE}/${ACTIVE}/anchor.lociarmap`)));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `post-world-maps/${ALICE}/${ACTIVE}/anchor.lociarmap`)));
  await assertFails(getBytes(ref(as(BOB), `post-world-maps/${ALICE}/${PENDING}/anchor.lociarmap`)));
  await assertSucceeds(getBytes(ref(as(ALICE), `post-world-maps/${ALICE}/${PENDING}/anchor.lociarmap`)));
});

test('world maps of active friends-only and private posts are readable by the owner only', async () => {
  for (const postId of [FRIENDS, PRIVATE]) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `post-world-maps/${ALICE}/${postId}/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' });
    });
    await assertFails(getBytes(ref(as(BOB), `post-world-maps/${ALICE}/${postId}/anchor.lociarmap`)));
    await assertSucceeds(getBytes(ref(as(ALICE), `post-world-maps/${ALICE}/${postId}/anchor.lociarmap`)));
  }
});

test('world maps under a folder that is not the post creator are never served to others', async () => {
  // Bob uploads a map into his own folder using Alice's active public post id.
  await assertSucceeds(uploadBytes(ref(as(BOB), `post-world-maps/${BOB}/${ACTIVE}/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
  await assertFails(getBytes(ref(as(ALICE), `post-world-maps/${BOB}/${ACTIVE}/anchor.lociarmap`)));
  await assertSucceeds(getBytes(ref(as(BOB), `post-world-maps/${BOB}/${ACTIVE}/anchor.lociarmap`)));
});

test('world maps: post folder must be a UUID', async () => {
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/not-a-uuid/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
});

test('legacy folders: no uploads, owners may delete leftovers, others may not', async () => {
  const paths = [`post-layer-assets/${ALICE}/x/a.jpg`, `post-video-assets/${ALICE}/x/a.mp4`, `post-reference-images/${ALICE}/x/a.jpg`, `post-surface-textures/${ALICE}/x/a.jpg`];
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const path of paths) await uploadBytes(ref(ctx.storage(), path), jpeg, { contentType: 'image/jpeg' });
  });
  for (const path of paths) {
    await assertFails(deleteObject(ref(as(BOB), path)));
    await assertSucceeds(deleteObject(ref(as(ALICE), path)));
  }
});

const AVATAR_SLOT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
async function grantAvatarSlot(id, luid, expiresInMs = 3_600_000) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'avatar_uploads', id), { luid, expires_at: Timestamp.fromMillis(Date.now() + expiresInMs) });
  });
}

test('avatars: an expired upload slot is refused even before TTL deletes it', async () => {
  const expired = 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await grantAvatarSlot(expired, ALICE, -60_000);
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/pending/${expired}.jpg`), jpeg, { contentType: 'image/jpeg' }));
});

test('avatars: a pending upload needs an upload slot owned by the uploader', async () => {
  const unslotted = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/pending/${unslotted}.jpg`), jpeg, { contentType: 'image/jpeg' }));
  const bobs = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await grantAvatarSlot(bobs, BOB);
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/pending/${bobs}.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(as(BOB), `avatars/${BOB}/pending/${bobs}.jpg`), jpeg, { contentType: 'image/jpeg' }));
});

test('avatars: only the owner uploads to pending; current is never client-writable', async () => {
  const id = AVATAR_SLOT;
  await grantAvatarSlot(id, ALICE);
  const path = `avatars/${ALICE}/pending/${id}.jpg`;
  await assertSucceeds(uploadBytes(ref(as(ALICE), path), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(BOB), path), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/current/${id}.jpg`), jpeg, { contentType: 'image/jpeg' }));
});

test('avatars: owner uploads JPEGs to pending only; only screened photos are readable', async () => {
  const id = AVATAR_SLOT;
  await grantAvatarSlot(id, ALICE);
  await assertSucceeds(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/pending/${id}.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${BOB}/pending/${id}.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/current/${id}.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `avatars/${ALICE}/pending/${id}.png`), jpeg, { contentType: 'image/png' }));
  await assertFails(getBytes(ref(as(BOB), `avatars/${ALICE}/pending/${id}.jpg`)));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), `avatars/${ALICE}/current/${id}.jpg`), jpeg, { contentType: 'image/jpeg' });
  });
  await assertSucceeds(getBytes(ref(as(BOB), `avatars/${ALICE}/current/${id}.jpg`)));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `avatars/${ALICE}/current/${id}.jpg`)));
});

test('camera reference frames can no longer be uploaded or read', async () => {
  const path = `post-reference-images/${ALICE}/p1/anchor.jpg`;
  await assertFails(uploadBytes(ref(as(ALICE), path), jpeg, { contentType: 'image/jpeg' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), jpeg, { contentType: 'image/jpeg' });
  });
  await assertFails(getBytes(ref(as(BOB), path)));
  await assertFails(getBytes(ref(as(ALICE), path)));
});

test('world maps are capped at 20 MB (compressed)', async () => {
  const big = new Uint8Array(20 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/${ACTIVE}/anchor.lociarmap`), big, { contentType: 'application/x-lociarmap' }));
});
