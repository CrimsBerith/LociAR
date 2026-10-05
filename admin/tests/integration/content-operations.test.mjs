import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^(localhost|127\.0\.0\.1):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST??'',/^(localhost|127\.0\.0\.1):\d+$/);
initializeApp({projectId:'demo-lociar'});
const {adminDb}=await import('../../lib/firebase-admin.ts');
const {parseContentInput,saveAdminPost,saveAdminComment,removeAdminComment,createManagedUser}=await import('../../lib/content-ops.ts');
const {emptyContent}=await import('../../lib/content-models.ts');
const {resolveModerationFlag,moderatePost,requestMetricApproval}=await import('../../lib/ops.ts');
const db=adminDb(),reason='Content operation regression verification';
after(()=>Promise.all(getApps().map(deleteApp)));
async function fixture(){const actor='content-'+randomUUID(),author=randomUUID();await db.collection('admin_role_assignments').doc(actor).set({user_id:actor,role_key:'super_admin',revoked_at:null});
 await db.collection('profiles').doc(author).set({handle:'author-'+author.slice(0,6),suspended:false,deleted_at:null});return{actor,author};}
function input(author,extra={}){return parseContentInput({...emptyContent,authorId:author,caption:'A panel post',text:'AR content',lat:-30,lng:110,status:'active',...extra});}

test('selected-author post creation is atomic, idempotent and produces an explicit native approximate placement',async()=>{
 const{actor,author}=await fixture(),key=randomUUID(),body=input(author);const[first,retry]=await Promise.all([saveAdminPost(body,actor,reason,key),saveAdminPost(body,actor,reason,key)]);assert.deepEqual(first,retry);
 const p=(await db.collection('posts').doc(first.id).get()).data();assert.equal(p.creator_id,author);assert.equal(p.created_by_admin,actor);assert.equal(p.multi_user_ready,false);assert.equal(p.status,'active');
 const anchor=JSON.parse(p.anchor_bundle_json);assert.equal(anchor.coordinateSpace,'admin_geo_estimate');assert.equal(anchor.anchor.pinQuality,'freeSpaceApproximate');assert.equal(anchor.anchor.transform.length,16);assert.ok(!anchor.anchor.persistence);
 assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('actor_id'),actor);
 await assert.rejects(saveAdminPost({...body,caption:'Changed request'},actor,reason,key),/idempotency_key_reused/);
});
test('18+, invalid links and non-finite placement are refused before a write',()=>{
 for(const extra of [{ageRating:'18_plus'},{lat:NaN},{lng:200},{width:0},{platform:'youtube',url:'https://youtube.com.evil.test/v'},{platform:'instagram',url:'http://instagram.com/p/a'}])assert.throws(()=>input(randomUUID(),extra));
 assert.equal(input(randomUUID(),{platform:'spotify',url:'https://open.spotify.com/track/123'}).platform,'spotify');
});
test('protected zones require separately authorized, reasoned exceptions and 18+ remains blocked',async()=>{
 const{actor,author}=await fixture(),zone=db.collection('protected_zones').doc(randomUUID());await zone.set({name:'Protected test site',lat:-31,lng:111,radius_meters:100,policy:'hard_block',active:true});
 const body=input(author,{lat:-31,lng:111});await assert.rejects(saveAdminPost(body,actor,reason,randomUUID()),/protected_zone/);
 const created=await saveAdminPost({...body,zoneExceptionReason:'Owner authorized site operation'},actor,reason,randomUUID());const post=await db.collection('posts').doc(created.id).get();assert.deepEqual(post.get('admin_zone_exception').zone_ids,[zone.id]);
 await moderatePost(created.id,'approve',actor,reason,randomUUID());assert.equal((await post.ref.get()).get('status'),'active');await zone.update({active:false});
});
test('post edit preserves the author; replacing a physical lock requires explicit consent and queues deletion',async()=>{
 const{actor,author}=await fixture(),body=input(author),created=await saveAdminPost(body,actor,reason,randomUUID()),ref=db.collection('posts').doc(created.id),anchorId='ua-'+randomUUID();
 await ref.update({cloud_anchor_id:anchorId,pose_json:JSON.stringify({latitude:body.lat,longitude:body.lng,heading:0,anchor:{coordinateSpace:'arkit_world'}})});
 await db.collection('cloud_anchors').doc(anchorId).set({post_id:created.id,owner_luid:author});
 await assert.rejects(saveAdminPost({...body,lat:-29},actor,reason,randomUUID(),created.id),/confirm_approximate_replacement/);
 await saveAdminPost({...body,lat:-29,replacePlacement:true},actor,reason,randomUUID(),created.id);assert.equal((await ref.get()).get('cloud_anchor_id'),null);assert.equal((await db.collection('cloud_anchors').doc(anchorId).get()).get('state'),'deleting');
 assert.equal((await db.collection('cloud_anchor_deletions').doc(anchorId).get()).exists,true);
 await assert.rejects(saveAdminPost({...body,authorId:randomUUID()},actor,reason,randomUUID(),created.id),/author_unavailable|post_author_cannot/);
});
test('comments can be created, edited and removed as selected users with independent actor audit',async()=>{
 const{actor,author}=await fixture(),post=await saveAdminPost(input(author),actor,reason,randomUUID()),key=randomUUID();
 const comment=await saveAdminComment(post.id,author,'Panel comment',actor,reason,key);assert.deepEqual(await saveAdminComment(post.id,author,'Panel comment',actor,reason,key),comment);
 let doc=await db.collection('comments').doc(comment.id).get();assert.equal(doc.get('user_id'),author);assert.equal(doc.get('created_by_admin'),actor);
 await assert.rejects(saveAdminComment(post.id,author,'Other body',actor,reason,key),/idempotency_key_reused/);
 await saveAdminComment(post.id,author,'Edited panel comment',actor,reason,randomUUID(),comment.id);assert.equal((await doc.ref.get()).get('text'),'Edited panel comment');
 const deletion=randomUUID();await removeAdminComment(post.id,comment.id,actor,reason,deletion);await removeAdminComment(post.id,comment.id,actor,reason,deletion);assert.equal((await doc.ref.get()).exists,false);
});
test('revoked roles, deleted authors and bidirectional blocks reject delegated content writes',async()=>{
 const{actor,author}=await fixture(),post=await saveAdminPost(input(author),actor,reason,randomUUID()),other=randomUUID();await db.collection('profiles').doc(other).set({handle:'other',suspended:false});
 await db.collection('user_blocks').doc(`${author}_${other}`).set({blocker_id:author,blocked_id:other});await assert.rejects(saveAdminComment(post.id,other,'Blocked comment',actor,reason,randomUUID()),/users_blocked/);
 await db.collection('account_deletion_jobs').doc(author).set({status:'pending'});await assert.rejects(saveAdminPost(input(author),actor,reason,randomUUID()),/account_deleting/);
 await db.collection('admin_role_assignments').doc(actor).update({revoked_at:new Date()});await assert.rejects(saveAdminPost(input(other),actor,reason,randomUUID()),/permission_revoked/);
});
test('managed users have unique handles, disabled unverified Auth identities and no administrative grants',async()=>{
 const{actor}=await fixture(),key=randomUUID(),body={handle:'managed_'+randomUUID().slice(0,8),displayName:'Panel user',email:''};
 const[first,retry]=await Promise.all([createManagedUser(body,actor,reason,key),createManagedUser(body,actor,reason,key)]);assert.deepEqual(first,retry);
 const privateRow=await db.collection('users_private').doc(first.id).get(),user=await getAuth().getUser(privateRow.get('uid'));assert.equal(user.disabled,true);assert.equal(user.emailVerified,false);assert.equal(user.customClaims.luid,first.id);
 assert.equal((await db.collection('handles').doc(body.handle).get()).get('luid'),first.id);assert.equal((await db.collection('admin_role_assignments').where('user_id','==',user.uid).get()).size,0);
 await assert.rejects(createManagedUser({...body,displayName:'Changed'},actor,reason,key),/idempotency_key_reused/);await assert.rejects(createManagedUser(body,actor,reason,randomUUID()),/handle_taken/);
});
test('fake filtered reports cannot impersonate authors and approval preserves an existing comment',async()=>{
 const{actor,author}=await fixture(),post=await saveAdminPost(input(author),actor,reason,randomUUID()),id=randomUUID(),flag=db.collection('moderation_flags').doc(randomUUID());
 const record={reason:'comment_filtered',post_id:post.id,user_id:null,status:'open',metadata:{comment_id:id,author_id:author,text:'Forged text'}};await flag.set(record);
 await assert.rejects(resolveModerationFlag(flag.id,'approve',actor,reason,randomUUID()),/moderation_original_unavailable/);assert.equal((await db.collection('comments').doc(id).get()).exists,false);
 await flag.update({server_origin:'comment_filter'});await db.collection('moderation_originals').doc(flag.id).set({target:'comment',id,post_id:post.id,user_id:author,text:'Original text'});
 await db.collection('comments').doc(id).set({user_id:author,post_id:post.id,text:'New clean version'});await resolveModerationFlag(flag.id,'approve',actor,reason,randomUUID());assert.equal((await db.collection('comments').doc(id).get()).get('text'),'New clean version');
});
test('profile moderation can restore only its trusted original and never overwrite a newer field edit',async()=>{
 const{actor,author}=await fixture(),flag=db.collection('moderation_flags').doc(randomUUID());await db.collection('profiles').doc(author).update({bio:null});
 await flag.set({reason:'profile_text_filtered',server_origin:'profile_filter',user_id:author,post_id:null,status:'open'});await db.collection('moderation_originals').doc(flag.id).set({target:'profile',user_id:author,field:'bio',text:'Reviewed false positive',replacement:null});
 await resolveModerationFlag(flag.id,'approve',actor,reason,randomUUID());assert.equal((await db.collection('profiles').doc(author).get()).get('bio'),'Reviewed false positive');
 await flag.update({status:'open'});await db.collection('profiles').doc(author).update({bio:'Newer clean bio'});await assert.rejects(resolveModerationFlag(flag.id,'approve',actor,reason,randomUUID()),/profile_changed_since_filtering/);
});
test('approval request creation and audit commit atomically and reject changed targets under reused keys',async()=>{
 const{actor,author}=await fixture(),post=await saveAdminPost(input(author),actor,reason,randomUUID()),key=randomUUID(),payload={viewsCount:20000,likesCount:0,commentsCount:0};
 await Promise.all([requestMetricApproval(post.id,payload,actor,reason,key),requestMetricApproval(post.id,payload,actor,reason,key)]);
 assert.equal((await db.collection('admin_approval_requests').doc(key).get()).get('status'),'pending');assert.equal((await db.collection('admin_audit_log').where('actor_id','==',actor).where('action','==','approval_requested').get()).size,1);
 await assert.rejects(requestMetricApproval(randomUUID(),payload,actor,reason,key),/idempotency_key_reused/);
});

test('definite email collisions release the unused managed-user handle reservation',async()=>{
 const{actor}=await fixture(),email='collision-'+randomUUID()+'@example.test',handle='rollback_'+randomUUID().slice(0,8),key=randomUUID();
 await getAuth().createUser({email});
 await assert.rejects(createManagedUser({handle,displayName:'Collision user',email},actor,reason,key),error=>error.code==='auth/email-already-exists');
 assert.equal((await db.collection('handles').doc(handle).get()).exists,false);
 assert.equal((await db.collection('admin_user_creations').doc(key).get()).exists,false);
 const created=await createManagedUser({handle,displayName:'Safe retry',email:''},actor,reason,randomUUID());assert.ok(created.id);
});

test('avatar removal commits an exact durable deletion job when Storage fails and replay keeps it',async()=>{
 const{actor,author}=await fixture(),key=randomUUID(),path=`avatars/${author}/current/${randomUUID()}.jpg`;
 await db.collection('profiles').doc(author).update({avatar_url:'storage://'+path});await db.collection('avatar_reviews').doc(author).set({path,status:'pending'});
 const{decideAvatar}=await import('../../lib/ops.ts');let attempts=0;const outage=async()=>{attempts++;throw new Error('storage temporarily unavailable');};
 await decideAvatar(author,'remove',actor,reason,key,outage);await decideAvatar(author,'remove',actor,reason,key,outage);
 assert.equal(attempts,1);assert.equal((await db.collection('profiles').doc(author).get()).get('avatar_url'),null);
 const jobs=await db.collection('avatar_deletions').where('luid','==',author).get();assert.equal(jobs.size,1);assert.equal(jobs.docs[0].get('path'),path);
 assert.equal((await db.collection('admin_audit_log').doc(key).get()).get('action'),'avatar_remove');
});
