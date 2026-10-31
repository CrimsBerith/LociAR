/** Owner-only reviewed package runner. Default is a complete live preflight; --apply explicitly publishes. */
import{readFileSync,writeFileSync}from'node:fs';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{spawnSync}from'node:child_process';
import{parseArgs}from'node:util';
import{createHash}from'node:crypto';
import{initializeOwnerRuntime,ownerActor}from'./launch-runtime.mjs';
import{reviewedContentUnchanged,renderedTextMatches}from'./launch-review.mjs';
const{values:opts}=parseArgs({options:{package:{type:'string'},apply:{type:'boolean',default:false},pilot:{type:'boolean',default:false},'verify-package-only':{type:'boolean',default:false}}});
if(!opts.package)throw Error('--package is required');
const folder=resolve(opts.package);const read=name=>JSON.parse(readFileSync(resolve(folder,name),'utf8'));
const seed=read('new-note-payload.json'),editPlan=read('existing-post-edits.json');
const inputFile=resolve(fileURLToPath(new URL('../../scripts/seed/private-launch-1680.json',import.meta.url)));
const immutableFiles=['new-note-payload.json','existing-post-edits.json','existing-post-baseline.json','existing-post-full-backup.json','1680-final-selection.json'];
const seal=read('input-seal.json');
if(seal.algorithm!=='sha256'||Object.keys(seal.files??{}).length!==immutableFiles.length)throw Error('Invalid reviewed package seal');
for(const name of immutableFiles)if(createHash('sha256').update(readFileSync(resolve(folder,name))).digest('hex')!==seal.files[name])throw Error('Reviewed input changed: '+name);
if(readFileSync(inputFile,'utf8')!==readFileSync(resolve(folder,'new-note-payload.json'),'utf8'))throw Error('Owner-only seed copy differs from reviewed package.');
if(seed.items.length!==1260||seed.items.some(i=>i.upload_hold||i.kind!=='note'||i.persona_status!=='reviewed'))throw Error('The full 1260-note selection must pass all holds first.');
if(opts['verify-package-only']){if(opts.apply||opts.pilot)throw Error('Integrity-only mode cannot publish');console.log(JSON.stringify({package_integrity:'passed',post_writes:0}));process.exit(0)}
const{db,auth}=initializeOwnerRuntime();const actor=await ownerActor(db,auth);
const handles=[...new Set(seed.items.map(item=>item.author_handle))];
if(handles.length!==190)throw Error('Expected 190 reviewed local writers');
const handleDocs=await db.getAll(...handles.map(h=>db.collection('handles').doc(h)));
if(handleDocs.some(d=>!d.exists||!d.get('luid')))throw Error('A managed writer handle is missing');
const luids=handleDocs.map(d=>d.get('luid'));
const [profiles,privateRows,roles]=await Promise.all([
 db.getAll(...luids.map(id=>db.collection('profiles').doc(id))),
 db.getAll(...luids.map(id=>db.collection('users_private').doc(id))),
 db.collection('admin_role_assignments').where('revoked_at','==',null).get(),
]);
const roleIds=new Set(roles.docs.map(d=>d.get('user_id')));const users=[];
for(let i=0;i<privateRows.length;i+=100){const part=privateRows.slice(i,i+100);if(part.some(d=>!d.exists||!d.get('uid')))throw Error('Managed Auth mapping missing');const found=await auth.getUsers(part.map(d=>({uid:d.get('uid')})));if(found.notFound.length)throw Error('Managed Auth user missing');users.push(...found.users)}
const byUid=new Map(users.map(u=>[u.uid,u]));
for(let i=0;i<handles.length;i++){
 const profile=profiles[i],user=byUid.get(privateRows[i].get('uid'));
 if(profile.get('handle')!==handles[i]||profile.get('admin_managed')!==true||profile.get('suspended')||profile.get('deleted_at')||!user.disabled||user.emailVerified||user.customClaims?.luid!==luids[i]||user.customClaims?.admin_role||roleIds.has(user.uid)||roleIds.has(luids[i]))throw Error('Managed identity safety invariant failed');
}
writeFileSync(resolve(folder,'managed-identities-live-preflight.json'),JSON.stringify({checked_at:new Date().toISOString(),checked:handles.length,disabled_unverified_no_admin:handles.length,complete:true,post_writes:0},null,2)+'\n',{mode:0o600});
const{parseContentInput,saveAdminPost,adminPostRequestHash}=await import('../lib/content-ops.ts');
const{permissionsFor}=await import('../lib/rbac.ts');
const{distanceMeters}=await import('../lib/geo.ts');
const roleDocs=await db.collection('admin_role_assignments').where('user_id','==',actor).where('revoked_at','==',null).get();const perms=permissionsFor(roleDocs.docs.map(d=>d.get('role_key')));
for(const permission of ['posts.create','posts.edit','posts.moderate'])if(!perms.has(permission))throw Error('Required publishing permission missing');
const zones=(await db.collection('protected_zones').where('active','==',true).get()).docs.filter(z=>z.get('policy')==='hard_block');
const reason='Owner-reviewed launch text correction; preserve author, anonymity and physical placement.';
const checked=[],errors=[];
const editedIds=new Set(editPlan.rows.map(r=>r.post_id));
const baseline=new Map(read('existing-post-baseline.json').rows.map(r=>[r.post_id,r]));
const unchanged=[...baseline.values()].filter(r=>!editedIds.has(r.post_id));
if(unchanged.length!==29)throw Error('Expected 29 unchanged existing records');
const unchangedDocs=await db.getAll(...unchanged.map(r=>db.collection('posts').doc(r.post_id)));
for(let i=0;i<unchanged.length;i++){const doc=unchangedDocs[i];if(!doc.exists||!reviewedContentUnchanged(doc.data(),unchanged[i]))errors.push({id:unchanged[i].post_id,error:'unchanged_post_changed_since_review'})}
for(let start=0;start<editPlan.rows.length;start+=100){
 const part=editPlan.rows.slice(start,start+100);const docs=await db.getAll(...part.map(x=>db.collection('posts').doc(x.post_id)));const audits=await db.getAll(...part.map(x=>db.collection('admin_audit_log').doc(x.key)));
 for(let n=0;n<part.length;n++){
  const row=part[n],doc=docs[n];let body;try{body=parseContentInput(row.input)}catch{errors.push({id:row.post_id,error:'invalid_input'});continue}
  const hash=adminPostRequestHash(actor,'admin_post_edit',row.post_id,body,reason);
  if(audits[n].exists){if(audits[n].get('request_hash')!==hash)errors.push({id:row.post_id,error:'audit_key_conflict'});else if(!doc.exists||doc.get('caption')!==body.caption||!renderedTextMatches(doc.data(),body.text)||doc.get('status')!==body.status||doc.get('visibility')!==body.visibility||doc.get('deleted_at')||doc.get('pose_json')!==baseline.get(row.post_id)?.pose_json||doc.get('anchor_bundle_json')!==baseline.get(row.post_id)?.anchor_bundle_json||doc.get('creator_id')!==body.authorId||doc.get('lat')!==body.lat||doc.get('lng')!==body.lng||(doc.get('is_anonymous')===true)!==(body.authorAttribution==='anonymous'))errors.push({id:row.post_id,error:'applied_post_changed_again'});else checked.push({...row,input:body,already_applied:true});continue}
  const version=doc.updateTime&&`${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`;
  if(!doc.exists||!reviewedContentUnchanged(doc.data(),baseline.get(row.post_id))){errors.push({id:row.post_id,error:'post_changed_since_review'});continue}
  const metadataOnlyRebase=version!==body.expectedUpdateTime;body.expectedUpdateTime=version;
  if(doc.get('creator_id')!==body.authorId||(doc.get('is_anonymous')===true)!==(body.authorAttribution==='anonymous')){errors.push({id:row.post_id,error:'identity_or_attribution_change'});continue}
  const pose=JSON.parse(doc.get('pose_json')||'{}');const rect=pose.anchor?.physicalRectMeters;
  if(doc.get('lat')!==body.lat||doc.get('lng')!==body.lng||pose.heading!==body.heading||(pose.altitude??0)!==body.altitude||rect?.width!==body.width||rect?.height!==body.height){errors.push({id:row.post_id,error:'placement_change'});continue}
  const hard=zones.some(z=>distanceMeters(body.lat,body.lng,Number(z.get('lat')),Number(z.get('lng')))<=Number(z.get('radius_meters')));
  if(hard&&(!body.zoneExceptionReason||!perms.has('zones.override'))){errors.push({id:row.post_id,error:'existing_zone_exception_permission_missing'});continue}
  checked.push({...row,input:body,already_applied:false,metadata_only_version_rebase:metadataOnlyRebase});
 }
}
const existingReport={checked_at:new Date().toISOString(),total:editPlan.rows.length,checked:checked.length,errors,complete:errors.length===0,apply_requested:opts.apply};writeFileSync(resolve(folder,'existing-edits-live-preflight.json'),JSON.stringify(existingReport,null,2)+'\n',{mode:0o600});
if(errors.length)throw Error('Existing-edit preflight failed; no notes were written.');
const adminDir=fileURLToPath(new URL('../',import.meta.url));
function seedRun(extra,report){
 const result=spawnSync(process.execPath,['--conditions=react-server','--import','./tests/register-typescript.mjs','--import','./scripts/launch-bootstrap.mjs','./scripts/seed-notes.mjs','--seed','private-launch-1680','--actor',actor,'--allow-approx','--require-complete','--report',resolve(folder,report),...extra],{cwd:adminDir,env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});
 writeFileSync(resolve(folder,report+'.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});if(result.error||result.status!==0)throw Error('Seed preflight/apply failed; inspect '+report+'.log');return JSON.parse(readFileSync(resolve(folder,report),'utf8'));
}
const preflight=seedRun([],'new-notes-live-preflight.json');if(!preflight.complete)throw Error('Incomplete new-note preflight.');
const deployment=read('server-readiness.json');
if(deployment.complete!==true||deployment.project!=='lociar-2f38c'||deployment.functions_checked!==39||deployment.scheduler_exactly_three!==true||!(Date.now()-Date.parse(deployment.checked_at)>=0&&Date.now()-Date.parse(deployment.checked_at)<24*3600*1000))throw Error('Run the current production protocol gate before publishing or declaring readiness.');
const sourceHash=createHash('sha256').update(readFileSync(inputFile)).digest('hex');
const result={status:'ready_for_controlled_import',checked_at:new Date().toISOString(),target:1680,existing_records:420,new_records:1260,existing_text_edits:editPlan.rows.length,existing_edit_preflight:'passed',new_note_preflight:'passed',payload_sha256:sourceHash,post_writes:0,apply_requested:opts.apply};
const saveReadiness=()=>writeFileSync(resolve(folder,'upload-readiness.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
if(opts.apply){
 const original=read('existing-post-full-backup.json');if(original.rows?.length!==420||new Set(original.rows.map(r=>r.id)).size!==420||original.rows.some(r=>!baseline.has(r.id)))throw Error('The full original 420-post backup is required before publishing');
 if(!opts.pilot){const pilot=read('pilot-reconciliation.json');if(pilot.complete!==true||pilot.expected!==18||pilot.payload_sha256!==sourceHash)throw Error('A matching successful 18-note pilot reconciliation is required first.');}
 result.status='apply_in_progress';delete result.post_writes;saveReadiness();
 try{
 if(opts.pilot){
  const selected=[];
  for(const city of ['Madrid','Nairobi','Tokyo']){const items=seed.items.filter(i=>i.city===city);if(items.length<6)throw Error('Pilot city missing six new notes: '+city);selected.push(...items.slice(0,6).map(i=>i.id));}
  if(selected.length!==18)throw Error('Pilot selection incomplete');const applied=seedRun(['--only',selected.join(','),'--apply'],'pilot-apply.json');if(!applied.apply_complete)throw Error('Pilot apply incomplete');result.status='pilot_applied_requires_live_reconciliation';result.new_records_saved=applied.saved;result.already_loaded=applied.already_loaded;result.post_save_calls=applied.saved;delete result.post_writes;
 }else{
  let edited=0;const outcomes=[];for(const row of checked){await saveAdminPost(row.input,actor,reason,row.key,row.post_id);if(!row.already_applied)edited++;outcomes.push({post_id:row.post_id,audit_id:row.key,status:row.already_applied?'already_applied':'saved'});writeFileSync(resolve(folder,'existing-edits-apply.json'),JSON.stringify({rows:outcomes,saved:edited,complete:outcomes.length===checked.length},null,2)+'\n',{mode:0o600})}
  const applied=seedRun(['--apply'],'full-apply.json');if(!applied.apply_complete)throw Error('Full apply incomplete');result.status='applied_requires_live_reconciliation';result.existing_edits_applied=edited;result.new_records_saved=applied.saved;result.already_loaded=applied.already_loaded;result.post_save_calls=edited+applied.saved;delete result.post_writes;
 }
 }catch(error){result.status='apply_failed_requires_live_reconciliation';result.error=error.message;saveReadiness();throw error;}
}
saveReadiness();console.log(JSON.stringify(result));
