import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const ALICE = '11111111-1111-5111-8111-111111111111';
const BOB = '22222222-2222-5222-8222-222222222222';
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lociar',
    storage: { rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8') },
  });
});
after(async () => env?.cleanup());
const as = (luid) => env.authenticatedContext(`uid-${luid}`, { luid }).storage();
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test('owners upload into their own folder only', async () => {
  await assertSucceeds(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/p1/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${BOB}/p1/anchor.lociarmap`), jpeg, { contentType: 'application/x-lociarmap' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/p1/anchor.exe`), jpeg, { contentType: 'application/octet-stream' }));
});

test('photo/video post uploads are closed (text + social links only)', async () => {
  await assertFails(uploadBytes(ref(as(ALICE), `post-layer-assets/${ALICE}/p1/layers/a.jpg`), jpeg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(as(ALICE), `post-video-assets/${ALICE}/p1/v.mp4`), jpeg, { contentType: 'video/mp4' }));
});

test('signed-in users read media; anonymous cannot', async () => {
  await assertSucceeds(getBytes(ref(as(BOB), `post-world-maps/${ALICE}/p1/anchor.lociarmap`)));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `post-world-maps/${ALICE}/p1/anchor.lociarmap`)));
});

test('avatars: owner uploads JPEGs to pending only; only screened photos are readable', async () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
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
  await assertFails(uploadBytes(ref(as(ALICE), `post-world-maps/${ALICE}/p2/anchor.lociarmap`), big, { contentType: 'application/x-lociarmap' }));
});
