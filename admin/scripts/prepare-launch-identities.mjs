// Provision only the reviewed managed content identities; never writes posts or admin roles.
import {readFileSync,writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {initializeOwnerRuntime,ownerActor} from './launch-runtime.mjs';
const {values:opts}=parseArgs({options:{input:{type:'string'},output:{type:'string'},apply:{type:'boolean',default:false}}});
if(!opts.input||!opts.output)throw Error('--input and --output required');
const {db,auth}=initializeOwnerRuntime();const {createManagedUser}=await import('../lib/content-ops.ts');const {derivedKey}=await import('../lib/ops.ts');const {handleIsBlocked,isReservedHandle,anyBlocked}=await import('../lib/content-moderation.ts');
const actor=await ownerActor(db,auth);const data=JSON.parse(readFileSync(opts.input,'utf8'));const identities=data.identities;
if(!Array.isArray(identities)||identities.length!==190||new Set(identities.map(i=>i.handle)).size!==190)throw Error('Expected 190 distinct reviewed identities');
for(const i of identities)if(!/^[a-z0-9_.]{3,30}$/.test(i.handle)||handleIsBlocked(i.handle)||isReservedHandle(i.handle)||anyBlocked([i.display_name])||!i.display_name||[...i.display_name].length>60)throw Error('Invalid reviewed identity '+i.identity_id);
const handles=await db.getAll(...identities.map(i=>db.collection('handles').doc(i.handle)));
const results=[];for(let n=0;n<identities.length;n++){
 const i=identities[n];const key=derivedKey('launch1680-v1:'+i.handle,'managed-user');
 if(handles[n].exists){const receipt=await db.collection('admin_audit_log').doc(key).get();if(!receipt.exists&&handles[n].get('creation_job')!==key)throw Error('Handle belongs to another operation: '+i.identity_id);}
}
if(opts.apply){
 async function provision(i){
  const key=derivedKey('launch1680-v1:'+i.handle,'managed-user');
  const result=await createManagedUser({handle:i.handle,displayName:i.display_name,email:''},actor,'Owner-requested launch preparation: local city content writer; disabled login, no admin role.',key);
  const profile=await db.collection('profiles').doc(result.id).get();const privateDoc=await db.collection('users_private').doc(result.id).get();const user=await auth.getUser(privateDoc.get('uid'));
  const roles=await db.collection('admin_role_assignments').where('user_id','==',user.uid).where('revoked_at','==',null).get();
  if(!user.disabled||user.emailVerified||roles.size||profile.get('admin_managed')!==true)throw Error('Managed identity invariant failed');
  results.push({identity_id:i.identity_id,handle:i.handle,luid:result.id,disabled:user.disabled,email_verified:user.emailVerified,admin_roles:roles.size,audit_id:key});
  writeFileSync(opts.output,JSON.stringify({status:'provisioned',post_writes:0,results},null,2)+'\n',{mode:0o600});
  if(results.length%20===0)console.log('Verified managed identities:',results.length);
 }
 let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<identities.length){const i=identities[cursor++];await provision(i);}}));
}else writeFileSync(opts.output,JSON.stringify({status:'dry_run_passed',identities:190,accounts_created:0,post_writes:0},null,2)+'\n');
console.log(JSON.stringify({status:opts.apply?'provisioned':'dry_run_passed',count:opts.apply?results.length:190,post_writes:0}));
