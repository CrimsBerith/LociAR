/** Read-only, expected-ID reconciliation after a controlled pilot/full seed import. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {initializeOwnerRuntime,ownerActor} from './launch-runtime.mjs';
import {renderedTextMatches} from './launch-review.mjs';
const {values:opts}=parseArgs({options:{package:{type:'string'},pilot:{type:'boolean',default:false}}});
if(!opts.package)throw Error('--package required');
const folder=resolve(opts.package),read=name=>JSON.parse(readFileSync(resolve(folder,name),'utf8'));
const selection=read('1680-final-selection.json'),seed=read('new-note-payload.json'),editPlan=read('existing-post-edits.json');
const baseline=new Map(read('existing-post-baseline.json').rows.map(row=>[row.post_id,row]));
const {db,auth}=initializeOwnerRuntime();await ownerActor(db,auth);
const {derivedKey}=await import('../lib/ops.ts');
const newById=new Map(seed.items.map(item=>[derivedKey(derivedKey(`${seed.batch}:${item.id}`,'seed'),'post'),item]));
let expected=selection.rows;
if(opts.pilot){const ids=new Set(read('pilot-apply.json').rows.map(r=>r.post_id));expected=expected.filter(r=>ids.has(r.expected_new_post_id));if(expected.length!==18)throw Error('Expected the reviewed 18-note pilot');}
const issues=[],indexIssues=[],posts=new Map();
for(let start=0;start<expected.length;start+=100){
 const ids=expected.slice(start,start+100).map(r=>r.post_id||r.expected_new_post_id);
 const docs=await db.getAll(...ids.map(id=>db.collection('posts').doc(id)));
 for(const doc of docs)posts.set(doc.id,doc);
}
const handles=[...new Set([...newById.values()].map(i=>i.author_handle))];
const handleDocs=await db.getAll(...handles.map(h=>db.collection('handles').doc(h)));
const authorIds=new Map(handleDocs.map((d,i)=>[handles[i],d.get('luid')]));
const originalEdits=new Map(editPlan.rows.map(r=>[r.post_id,r.input]));
for(const row of expected){
 const id=row.post_id||row.expected_new_post_id,doc=posts.get(id),item=newById.get(id),old=originalEdits.get(id);
 if(!doc?.exists){issues.push({id,error:'missing_post'});continue;}
 const data=doc.data();
 if(data.caption!==row.text||!renderedTextMatches(data,row.text)||data.status!=='active'||data.visibility!=='public'||data.deleted_at||data.lat!==row.lat||data.lng!==row.lng||data.admin_managed!==true)issues.push({id,error:'content_or_placement_mismatch'});
 if(item){
  if(data.creator_id!==authorIds.get(item.author_handle)||(data.is_anonymous===true)!==(item.author_attribution==='anonymous')||data.seed_batch!==seed.batch||data.note_kind!=='location'||data.notify_radius_m!==item.radius_m)issues.push({id,error:'new_post_identity_or_policy_mismatch'});
 }else{
  const before=baseline.get(id);
  if(!before||data.creator_id!==before.creator_id||(data.is_anonymous===true)!==(before.is_anonymous===true)||data.pose_json!==before.pose_json||data.anchor_bundle_json!==before.anchor_bundle_json||data.push_state!==before.push_state)issues.push({id,error:'existing_author_attribution_placement_or_notification_changed'});
 }
}
// Verify both member and map-cell entry; asynchronous trigger lag remains a failure until repaired.
const members=[];
for(let start=0;start<expected.length;start+=100){const part=expected.slice(start,start+100);members.push(...await db.getAll(...part.map(r=>db.collection('map_cell_members').doc(r.post_id||r.expected_new_post_id))));}
const cells=[...new Set(members.filter(d=>d.exists&&typeof d.get('cell')==='string').map(d=>d.get('cell')))];
const cellDocs=cells.length?await db.getAll(...cells.map(id=>db.collection('map_cells').doc(id))):[];const byCell=new Map(cellDocs.map(d=>[d.id,d]));
for(let i=0;i<members.length;i++){
 const member=members[i],row=expected[i],id=row.post_id||row.expected_new_post_id,data=posts.get(id)?.data();
 const entry=data&&[data.lat,data.lng,data.creator_id,data.is_anonymous===true?1:0,typeof data.spot_id==='string'?data.spot_id:''];
 const cell=byCell.get(member.get('cell'));const stored=cell?.data()?.posts?.[id];
 if(!entry||!member.exists||member.get('overflow')===true||JSON.stringify(member.get('entry'))!==JSON.stringify(entry)||JSON.stringify(stored)!==JSON.stringify(entry))indexIssues.push({id,error:'map_index_not_converged'});
}
const actualBatch=await db.collection('posts').where('seed_batch','==',seed.batch).select().limit(1261).get();
const unexpected=actualBatch.docs.filter(d=>!newById.has(d.id)).map(d=>d.id);
const flags=await db.collection('system').doc('geo_queries').get();
const report={checked_at:new Date().toISOString(),mode:opts.pilot?'pilot':'full',expected:expected.length,matched:expected.length-new Set(issues.map(x=>x.id)).size,issues,index_issues:indexIssues,unexpected_batch_ids:unexpected,map_cells_version:flags.get('map_cells_version')??null,
 payload_sha256:createHash('sha256').update(readFileSync(resolve(folder,'new-note-payload.json'))).digest('hex'),
 complete:issues.length===0&&indexIssues.length===0&&unexpected.length===0&&flags.get('map_cells_version')===1&&(!opts.pilot?actualBatch.size===1260:true),post_writes:0};
writeFileSync(resolve(folder,opts.pilot?'pilot-reconciliation.json':'full-reconciliation.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({mode:report.mode,expected:report.expected,issues:issues.length,index_issues:indexIssues.length,unexpected:unexpected.length,complete:report.complete,post_writes:0}));
if(!report.complete)process.exitCode=1;
