import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const OWNER = '77777777-7777-5777-8777-777777777777';
const POST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const bytes = new Uint8Array([1, 2, 3]);
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lociar',
    storage: { rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8') },
    firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'profiles', OWNER), { deleted_at: null, suspended: false });
    await setDoc(doc(ctx.firestore(), 'account_access', OWNER), { state: 'active' });
  });
});
after(async () => env?.cleanup());
const owner = () => env.authenticatedContext('reclamation-owner', { luid: OWNER });
const upload = (storage, name) => uploadBytes(ref(storage, name), bytes, { contentType: 'application/x-lociarmap' });

test('anonymous public geometry stays owner-only at its real account path', async () => {
  const path = `post-world-maps/${OWNER}/${POST}/anonymous.lociarmap`;
  await env.withSecurityRulesDisabled(async ctx => {
    await upload(ctx.storage(), path);
    await setDoc(doc(ctx.firestore(), 'storage_reclamations', POST), {
      creator_id: OWNER, state: 'committed', world_map_path: path, public_readable: true, is_anonymous: true,
    });
  });
  await assertSucceeds(getBytes(ref(owner().storage(), path)));
  const other = env.authenticatedContext('another-user', { luid: '88888888-8888-5888-8888-888888888888' });
  await assertFails(getBytes(ref(other.storage(), path)), 'the callable is the only public map path');
});

test('pending and reclaimed draft claims block new and replacement maps, including uppercase post paths', async () => {
  const path = `post-world-maps/${OWNER}/${POST.toUpperCase()}/map.lociarmap`;
  await env.withSecurityRulesDisabled(async (ctx) => { await upload(ctx.storage(), path); });
  for (const state of ['pending', 'reclaimed']) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'storage_reclamations', POST), { creator_id: OWNER, state });
    });
    await assertFails(upload(owner().storage(), path));
    await assertFails(upload(owner().storage(), `post-world-maps/${OWNER}/${POST}/new.lociarmap`));
    await assertFails(getBytes(ref(owner().storage(), path)), 'reclaimed geometry is no longer accessible');
  }
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), 'storage_reclamations', POST)); });
  await assertFails(upload(owner().storage(), path), 'missing admission never reopens an expired upload');
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(),'storage_reclamations',POST),{creator_id:OWNER,state:'draft'}); });
  await assertSucceeds(upload(owner().storage(), `post-world-maps/${OWNER}/${POST}/fresh.lociarmap`), 'an admitted draft can create a fresh immutable map');
});

test('clients cannot create or clear storage reclamation claims or jobs', async () => {
  for (const collection of ['storage_reclamations', 'storage_reclamation_queue']) {
    const claim = doc(owner().firestore(), collection, POST);
    await assertFails(setDoc(claim, { creator_id: OWNER, state: 'reclaimed' }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), collection, POST), { creator_id: OWNER, state: 'pending' });
    });
    await assertFails(deleteDoc(claim));
  }
});
