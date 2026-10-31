import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({ projectId: 'demo-lociar' });
const { adminDb, adminAuth } = await import('../../lib/firebase-admin.ts');
const db = adminDb();
after(() => Promise.all(getApps().map(deleteApp)));

const BATCH = 'world-capitals-2026-10';
const adminRoot = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Runs an owner script (admin/scripts/) the way scripts/load-launch-seed.command does, against the emulator. */
async function script(name, ...args) {
  try {
    const { stdout, stderr } = await execute(process.execPath,
      ['--conditions=react-server', '--import', './tests/register-typescript.mjs', `scripts/${name}`, ...args],
      { cwd: adminRoot, env: { ...process.env, GOOGLE_CLOUD_PROJECT: 'demo-lociar' } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}
const importer = (...args) => script('seed-notes.mjs', ...args);
const seedPosts = async () => (await db.collection('posts').where('seed_batch', '==', BATCH).get()).docs;

test('the launch seed importer checks first, loads each place once through the audited path and retires the batch', async () => {
  const actor = 'seed-' + randomUUID(), author = randomUUID();
  await db.collection('admin_role_assignments').doc(actor).set({ user_id: actor, role_key: 'super_admin', revoked_at: null });
  await db.collection('profiles').doc(author).set({ handle: 'loci.guide', display_name: 'LociAR Guide', admin_managed: true, suspended: false, deleted_at: null });
  await db.collection('handles').doc('loci.guide').set({ luid: author });
  const run = (...args) => importer('--seed', 'world-capitals', '--actor', actor, ...args);

  const dry = await run('--only', 'london,madrid');
  assert.equal(dry.code, 0, dry.stderr);
  assert.match(dry.stdout, /^London +7 notes {2}1 AR/m);
  assert.match(dry.stdout, /^Madrid +7 notes {2}1 AR {2}8 held \(approx\)/m, 'Madrid has an approximate anchor');
  assert.match(dry.stdout, /16 items: 0 already loaded, 0 with problems, 8 held for an approximate anchor\./);
  assert.equal((await seedPosts()).length, 0, 'a dry run writes nothing');

  const complete = await run('--only', 'london,madrid', '--apply', '--require-complete');
  assert.equal(complete.code, 1, complete.stderr);
  assert.match(complete.stderr, /Incomplete selection: 8 unloaded items are blocked or held\. Nothing was written\./);
  assert.equal((await seedPosts()).length, 0, 'strict completion rejects the whole selection before loading eligible London rows');
  assert.equal((await db.collection('admin_audit_log').where('actor_id', '==', actor).get()).size, 0,
    'a rejected strict selection creates no post audit receipts');

  const load = await run('--only', 'london,madrid', '--apply');
  assert.equal(load.code, 0, load.stderr);
  assert.match(load.stdout, /Loaded 8 items\./, 'approximate anchors stay held without --allow-approx');
  const posts = (await seedPosts()).map(doc => doc.data());
  assert.equal(posts.length, 8);
  assert.ok(posts.every(p => p.admin_managed === true), 'only a managed author gives a post the official badge');
  assert.ok(posts.every(p => p.creator_id === author && p.created_by_admin === actor && p.status === 'active' && p.geospatial === false));
  assert.equal(posts.filter(p => p.note_kind === 'location').length, 7);
  assert.equal(posts.filter(p => p.push_state === 'approved').length, 1, 'one note per place notifies');
  assert.equal((await db.collection('admin_audit_log').where('actor_id', '==', actor).get()).size, 8, 'one audit receipt per item');

  const again = await run('--only', 'london', '--apply');
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /8 items: 8 already loaded/);
  assert.match(again.stdout, /Loaded 0 items\./, 'a rerun skips what is loaded');
  const firstRef=(await seedPosts())[0].ref,originalCaption=(await firstRef.get()).get('caption');
  await firstRef.update({caption:'Changed after the original import'});
  const changed=await run('--only','london','--apply','--require-complete');
  assert.equal(changed.code,1);assert.match(changed.stderr,/Existing content mismatch: 1 selected posts/);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).get()).size,8);
  await firstRef.update({caption:originalCaption});

  // The business batch checks against the same author and zones; it is never written here.
  const businesses = await importer('--seed', 'landmark-businesses', '--actor', actor);
  assert.equal(businesses.code, 0, businesses.stderr);
  assert.match(businesses.stdout, /\b\d+ items: 0 already loaded, 0 with problems,/);

  for (const batch of ['istanbul-beta', 'turkey-streets']) {
    const plan=JSON.parse(readFileSync(new URL(`../../../scripts/seed/${batch}.json`,import.meta.url),'utf8'));
    for(const handle of new Set(plan.items.map(item=>item.author_handle))){
      if((await db.collection('handles').doc(handle).get()).exists)continue;
      const id=randomUUID();await db.collection('profiles').doc(id).set({handle,admin_managed:true,suspended:false,deleted_at:null});
      await db.collection('handles').doc(handle).set({luid:id});
    }
    const drafts = await importer('--seed', batch, '--actor', actor);
    assert.equal(drafts.code, 0, drafts.stderr);
    assert.match(drafts.stdout, /0 with problems,/);
  }
  const istanbul = JSON.parse(readFileSync(new URL('../../../scripts/seed/istanbul-beta.json', import.meta.url), 'utf8'));
  const fieldAR = istanbul.items.find(item => item.placement_requirement === 'field_cloud_anchor');
  const fieldAttempt = await importer('--seed', 'istanbul-beta', '--actor', actor, '--only', fieldAR.id, '--apply', '--allow-approx', '--require-complete');
  assert.equal(fieldAttempt.code, 1, fieldAttempt.stderr);
  assert.match(fieldAttempt.stdout, /1 AR drafts require an on-site Cloud Anchor/);
  assert.match(fieldAttempt.stderr, /Nothing was written\./);
  assert.equal((await db.collection('posts').where('seed_batch', '==', istanbul.batch).get()).empty, true);

  const retire = await run('--retire');
  assert.equal(retire.code, 0, retire.stderr);
  assert.match(retire.stdout, /^8 posts from world-capitals\.json end at /m);
  assert.ok((await seedPosts()).every(doc => doc.get('ends_at')), 'every seed post has an end date');
});

test('the launch seed importer reads seed files from scripts/seed/ only', async () => {
  for (const seed of ['../../package', '/etc/passwd', 'world-capitals.json', '../scripts/seed/world-capitals']) {
    const run = await importer('--seed', seed, '--actor', 'anyone');
    assert.equal(run.code, 2, seed);
    assert.match(run.stderr, /^Seeds in scripts\/seed\/: .*\bworld-capitals\b/m);
  }
});

test('seed preparation picks the named super admin and creates @loci.guide once', async () => {
  const email = `seed-actor-${randomUUID()}@example.com`;
  const { uid } = await adminAuth().createUser({ email });
  await db.collection('admin_role_assignments').doc(`${uid}_super_admin`).set({ user_id: uid, role_key: 'super_admin', revoked_at: null });
  await db.collection('handles').doc('loci.guide').delete();

  const unknown = await script('seed-prepare.mjs', '--actor-email', 'nobody@example.com');
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /No active super admin with the email nobody@example\.com\./);

  const first = await script('seed-prepare.mjs', '--actor-email', email.toUpperCase());
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.stdout.trim(), uid, 'stdout carries only the actor uid');
  assert.match(first.stderr, /Created @loci\.guide\./);
  const luid = (await db.collection('handles').doc('loci.guide').get()).get('luid');
  const profile = await db.collection('profiles').doc(luid).get();
  assert.equal(profile.get('admin_managed'), true);
  assert.equal(profile.get('display_name'), 'LociAR Guide');
  const user = await adminAuth().getUser((await db.collection('users_private').doc(luid).get()).get('uid'));
  assert.ok(user.disabled && !user.emailVerified, 'the content identity cannot sign in');

  const again = await script('seed-prepare.mjs', '--actor-email', email);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stderr, /@loci\.guide exists\./);
  assert.equal((await db.collection('handles').doc('loci.guide').get()).get('luid'), luid);
});

test('per-note identity and attribution are used, draft holds cannot be bypassed and replay creates no duplicates',async()=>{
 const suffix=randomUUID().slice(0,8),actor='seed-attrs-'+suffix,authors=[randomUUID(),randomUUID()];
 await db.collection('admin_role_assignments').doc(actor).set({user_id:actor,role_key:'super_admin',revoked_at:null});
 const handles=authors.map((_,i)=>`seed_attr_${suffix}_${i}`);
 for(let i=0;i<authors.length;i++){
  await db.collection('profiles').doc(authors[i]).set({handle:handles[i],admin_managed:true,suspended:false,deleted_at:null});
  await db.collection('handles').doc(handles[i]).set({luid:authors[i]});
 }
 const name='qa-attribution-'+suffix,batch=name;
 const file=new URL(`../../../scripts/seed/${name}.json`,import.meta.url);
 const seed={batch,items:authors.map((_,i)=>({id:'item-'+i,kind:'note',text:'An attribution fixture '+i,lat:-22,lng:115+i*.001,city:'Fixture',coord:'reviewed',persona_id:'P46',persona_status:'reviewed',author_handle:handles[i],author_attribution:i?'anonymous':'named'}))};
 const run=(...args)=>importer('--seed',name,'--actor',actor,...args);
 try{
  writeFileSync(file,JSON.stringify(seed));
  const override=await run('--author',authors[0],'--apply');
  assert.equal(override.code,1);assert.match(override.stderr,/cannot override per-note identity/);
  seed.items[0].author_handle='not_provisioned_'+suffix;writeFileSync(file,JSON.stringify(seed));
  const missing=await run('--apply','--require-complete');assert.equal(missing.code,1);
  assert.match(missing.stdout,/identity is not provisioned/);
  assert.equal((await db.collection('posts').where('seed_batch','==',batch).get()).size,0);
  seed.items[0].author_handle=handles[0];
  seed.items[0].persona_status='editorial_draft';writeFileSync(file,JSON.stringify(seed));
  const held=await run('--apply','--allow-approx','--require-complete');
  assert.equal(held.code,1);assert.match(held.stderr,/Nothing was written/);
  assert.equal((await db.collection('posts').where('seed_batch','==',batch).get()).size,0);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).get()).size,0);
  seed.items[0].persona_status='reviewed';writeFileSync(file,JSON.stringify(seed));
  const loaded=await run('--apply','--require-complete');assert.equal(loaded.code,0,loaded.stderr);
  const posts=(await db.collection('posts').where('seed_batch','==',batch).get()).docs;
  assert.equal(posts.length,2);
  for(let i=0;i<authors.length;i++){
   const post=posts.find(p=>p.get('creator_id')===authors[i]);assert.ok(post);
   assert.equal(post.get('is_anonymous'),Boolean(i));assert.equal(post.get('admin_managed'),true);
  }
  assert.match((await run('--apply','--require-complete')).stdout,/Loaded 0 items/);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).get()).size,2);
  await db.collection('handles').doc(handles[0]).delete();
  const unresolved=await run('--apply','--require-complete');assert.equal(unresolved.code,1);
  assert.match(unresolved.stderr,/Existing content mismatch/);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).get()).size,2);
 }finally{unlinkSync(file);}
});

test('a selected seed is blocked by three neighbours from other live content',async()=>{
 const actor='seed-density-'+randomUUID(),author=randomUUID();
 await db.collection('admin_role_assignments').doc(actor).set({user_id:actor,role_key:'super_admin',revoked_at:null});
 await db.collection('profiles').doc(author).set({handle:'density_author',admin_managed:true,suspended:false,deleted_at:null});
 const seed=JSON.parse(readFileSync(new URL('../../../scripts/seed/world-capitals.json',import.meta.url),'utf8'));
 const item=seed.items.find(r=>r.id==='madrid-01');
 const refs=[0,1,2].map(()=>db.collection('posts').doc('outside-selection-'+randomUUID()));
 try{
  for(const ref of refs)await ref.set({lat:item.lat,lng:item.lng,status:'active',visibility:'public',deleted_at:null,seed_batch:'another-batch'});
  const result=await importer('--seed','world-capitals','--actor',actor,'--author',author,'--only',item.id,'--allow-approx','--apply','--require-complete');
  assert.equal(result.code,1);assert.match(result.stdout,/4 combined live\/selected posts within 6 m/);
  assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).get()).size,0);
 }finally{await Promise.all(refs.map(ref=>ref.delete()));}
});

test('machine-readable strict preflight reports held rows and a passing dry run without publishing',async()=>{
 const actor='report-'+randomUUID(),author=randomUUID(),handle='report_'+randomUUID().slice(0,8),name='qa-report-'+randomUUID();
 await db.collection('admin_role_assignments').doc(actor).set({user_id:actor,role_key:'super_admin',revoked_at:null});
 await db.collection('profiles').doc(author).set({handle,admin_managed:true,suspended:false,deleted_at:null});
 await db.collection('handles').doc(handle).set({luid:author});
 const file=fileURLToPath(new URL('../../../scripts/seed/'+name+'.json',import.meta.url));const report='/tmp/lociar-seed-report-'+randomUUID()+'.json';
 const seed={batch:name,author_handle:handle,items:[{id:'one',kind:'note',author_handle:handle,text:'A readable test note.',lat:-35,lng:145,city:'Fixture',coord:'reviewed',persona_id:'P01',persona_status:'editorial_draft',notify:false}]};
 try{
  writeFileSync(file,JSON.stringify(seed));const held=await importer('--seed',name,'--actor',actor,'--require-complete','--report',report);assert.equal(held.code,1);
  const first=JSON.parse(readFileSync(report,'utf8'));assert.equal(first.complete,false);assert.equal(first.held,1);assert.equal(first.apply_requested,false);
  seed.items[0].persona_status='reviewed';writeFileSync(file,JSON.stringify(seed));const passing=await importer('--seed',name,'--actor',actor,'--require-complete','--report',report);assert.equal(passing.code,0,passing.stderr);
  const last=JSON.parse(readFileSync(report,'utf8'));assert.equal(last.complete,true);assert.equal(last.blocked,0);assert.equal(last.total,1);assert.equal((await db.collection('posts').where('seed_batch','==',name).get()).size,0);
  const apply=await importer('--seed',name,'--actor',actor,'--require-complete','--apply','--report',report);assert.equal(apply.code,0,apply.stderr);
  const saved=JSON.parse(readFileSync(report,'utf8'));assert.equal(saved.apply_complete,true);assert.equal(saved.saved,1);assert.equal(saved.failed,0);assert.equal(saved.apply_results[0].status,'saved');
  const again=await importer('--seed',name,'--actor',actor,'--require-complete','--apply','--report',report);assert.equal(again.code,0,again.stderr);
  const repeated=JSON.parse(readFileSync(report,'utf8'));assert.equal(repeated.apply_complete,true);assert.equal(repeated.saved,0);assert.equal(repeated.already_loaded,1);assert.deepEqual(repeated.apply_results,[]);
  await db.collection('posts').doc(saved.apply_results[0].post_id).update({edit_data_json:JSON.stringify({layers:[{type:'text',text:'Changed rendered text'}]})});
  const changed=await importer('--seed',name,'--actor',actor,'--require-complete','--report',report);assert.equal(changed.code,1);assert.equal(JSON.parse(readFileSync(report,'utf8')).complete,false);
 }finally{try{unlinkSync(file)}catch{}try{unlinkSync(report)}catch{}}
});
