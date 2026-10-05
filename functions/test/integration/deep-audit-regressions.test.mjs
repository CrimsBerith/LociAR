import test,{after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {adminDb,closeClients,newUser,postBody} from './_harness.mjs';
import {onCommentCreated,onProfileUpdated} from '../../lib/triggers.js';import {claimAnchorDeletion,anchorBindError} from '../../lib/anchors.js';import {readPublicContent} from '../../lib/publicContent.js';
const require=createRequire(import.meta.url),core=require('../../lib/core.js'),avatar=require('../../lib/avatar.js'),Vision=require('@google-cloud/vision').ImageAnnotatorClient;
after(closeClients);
const request=(uid,data)=>({auth:{uid,token:{email_verified:true,firebase:{sign_in_provider:'password'}}},data:{userId:core.luidForUid(uid),...data}});
async function profile(luid){await adminDb.collection('profiles').doc(luid).set({handle:'test-'+luid.slice(0,6),deleted_at:null,suspended:false});await adminDb.collection('account_access').doc(luid).set({state:'active'});}

test('an old filtered-comment create delivery cannot delete a clean re-created document',async()=>{
 const author=randomUUID();await profile(author);const ref=adminDb.collection('comments').doc(randomUUID()),old={user_id:author,post_id:randomUUID(),text:'siktir git'};await ref.set(old);const event=await ref.get();await ref.delete();await ref.set({...old,text:'New clean comment'});
 await onCommentCreated.run({id:randomUUID(),data:event,params:{id:ref.id}});assert.equal((await ref.get()).get('text'),'New clean comment');assert.equal((await adminDb.collection('moderation_flags').doc('comment_'+ref.id).get()).exists,false);
});
test('filter archive stores the exact trusted original, survives the count marker and excludes stale profile deliveries',async()=>{
 const author=randomUUID();await profile(author);const ref=adminDb.collection('comments').doc(randomUUID());await ref.set({user_id:author,post_id:randomUUID(),text:'siktir git'});const event=await ref.get();await onCommentCreated.run({id:randomUUID(),data:event,params:{id:ref.id}});
 const flag=await adminDb.collection('moderation_flags').doc('comment_'+ref.id).get(),original=await adminDb.collection('moderation_originals').doc(flag.id).get();assert.equal(flag.get('server_origin'),'comment_filter');assert.equal(original.get('text'),'siktir git');assert.equal((await ref.get()).exists,false);
 const owner=adminDb.collection('profiles').doc(author);await owner.update({bio:'New clean bio'});await onProfileUpdated.run({id:randomUUID(),params:{luid:author},data:{before:{data:()=>({handle:'test',bio:'old'})},after:{data:()=>({handle:'test',bio:'fuck'})}}});assert.equal((await owner.get()).get('bio'),'New clean bio');
});
test('publication and handle changes require their intended user and cannot run as a changed session',async()=>{
 const a=await newUser(),b=await newUser();await assert.rejects(b.call('createPost',postBody({userId:a.luid})),error=>error.details?.reason==='session_changed');await assert.rejects(b.call('updateHandle',{handle:'wrong_owner',userId:a.luid}),error=>error.details?.reason==='session_changed');
 await assert.rejects(b.call('createPost',postBody({userId:undefined})),error=>error.details?.reason==='session_changed');
});
test('a claimed orphan anchor cannot be registered or bound while remote deletion is in flight',async()=>{
 const user=await newUser(),id='ua-'+randomUUID();await user.call('registerCloudAnchor',{cloudAnchorId:id});assert.equal(await claimAnchorDeletion(id,null),true);
 const record=(await adminDb.collection('cloud_anchors').doc(id).get()).data();assert.match(anchorBindError(record,user.luid),/reclaimed/);await assert.rejects(user.call('registerCloudAnchor',{cloudAnchorId:id}));
 await assert.rejects(user.call('createPost',postBody({pose:{latitude:12,longitude:50,heading:0,anchor:{coordinateSpace:'visual_surface',x:0,y:0,z:0,yaw:0,pitch:0,roll:0,capturedAt:new Date().toISOString(),persistence:{kind:'arcore_cloud_anchor',cloudAnchorId:id,originalNativeAnchorId:randomUUID(),hostedAt:new Date().toISOString(),version:1}}}})));
});
test('public projections paginate past blocked/adult rows and honor both block directions and accepted deletions',async()=>{
 const viewer=await newUser(),author=await newUser(),blocked=await newUser();await adminDb.collection('user_blocks').doc(`${blocked.luid}_${viewer.luid}`).set({blocker_id:blocked.luid,blocked_id:viewer.luid});
 const prefix='public-'+randomUUID();const refs=[];for(let i=0;i<55;i++){const ref=adminDb.collection('posts').doc(randomUUID());refs.push(ref);await ref.set({creator_id:i<50?blocked.luid:author.luid,status:'active',visibility:'public',age_rating:'all',caption:prefix,created_at:core.Timestamp.fromMillis(2090000000000-i*1000)});}
 const first=await readPublicContent.run(request(viewer.uid,{mode:'discover'}));assert.equal(first.posts.filter(p=>p.caption===prefix).length,0);assert.ok(first.next);
 const second=await readPublicContent.run(request(viewer.uid,{mode:'discover',cursor:first.next}));assert.equal(second.posts.filter(p=>p.caption===prefix).length,5);
 await refs[50].update({age_rating:'18_plus'});assert.equal((await readPublicContent.run(request(viewer.uid,{mode:'single',postId:refs[50].id}))).posts.length,0);
 await adminDb.collection('account_deletion_jobs').doc(author.luid).set({status:'pending'});assert.equal((await readPublicContent.run(request(viewer.uid,{mode:'profile',creatorId:author.luid}))).profile,null);assert.equal((await readPublicContent.run(request(viewer.uid,{mode:'single',postId:refs[51].id}))).posts.length,0);
 for(const ref of refs)await ref.delete();
});
test('nearby search reaches valid posts beyond 200 raw rows and covers neighbors around a pole',async()=>{
 const viewer=await newUser(),owner=await newUser(),refs=[];for(let i=0;i<205;i++){const ref=adminDb.collection('posts').doc(randomUUID());refs.push(ref);await ref.set({creator_id:owner.luid,status:'active',visibility:'public',age_rating:'all',lat:5,lng:120,created_at:core.Timestamp.now()});}
 const close=adminDb.collection('posts').doc(randomUUID());await close.set({creator_id:owner.luid,status:'active',visibility:'public',age_rating:'all',lat:5.00001,lng:20,created_at:core.Timestamp.now()});
 const result=await readPublicContent.run(request(viewer.uid,{mode:'nearby',latitude:5,longitude:20,radiusMeters:120}));assert.ok(result.posts.some(p=>p.id===close.id));
 await close.update({lat:89.9999,lng:90});const pole=await readPublicContent.run(request(viewer.uid,{mode:'nearby',latitude:89.9999,longitude:0,radiusMeters:120}));assert.ok(pole.posts.some(p=>p.id===close.id));
 await close.delete();for(const ref of refs)await ref.delete();
});
test('older avatar cleanup preserves the newer winner and completed screening returns one stable receipt',async()=>{
 const originalBucket=core.bucket,originalVision=Vision.prototype.safeSearchDetection,objects=new Set();let heldPath=null,reached,release;
 const fake={name:'demo-avatar-only',file(name){return{name,metadata:{timeCreated:'2020-01-01T00:00:00Z'},exists:async()=>[objects.has(name)],setMetadata:async()=>{},copy:async target=>{assert.ok(objects.has(name));objects.add(target.name);},delete:async()=>{if(name===heldPath){heldPath=null;reached();await new Promise(resolve=>{release=resolve;});}objects.delete(name);}};},getFiles:async({prefix})=>[[...objects].filter(n=>n.startsWith(prefix)).map(n=>fake.file(n)),null]};
 core.bucket=()=>fake;Vision.prototype.safeSearchDetection=async()=>[{safeSearchAnnotation:{adult:1,racy:1,violence:1,medical:1}}];
 try{const uid=randomUUID(),luid=core.luidForUid(uid),a=randomUUID(),b=randomUUID();await profile(luid);
  async function seed(id){await adminDb.collection('avatar_uploads').doc(id).set({luid});await adminDb.collection('avatar_reviews').doc(luid).set({luid,latest_object:`avatars/${luid}/pending/${id}.jpg`},{merge:true});objects.add(`avatars/${luid}/pending/${id}.jpg`);}
  await seed(a);heldPath=`avatars/${luid}/pending/${a}.jpg`;const barrier=new Promise(resolve=>{reached=resolve;});const first=avatar.screenAvatar.run(request(uid,{objectId:a}));await barrier;
  await seed(b);assert.equal((await avatar.screenAvatar.run(request(uid,{objectId:b}))).status,'accepted');release();assert.equal((await first).status,'accepted');
  const winningPath=`avatars/${luid}/current/${b}.jpg`;assert.ok(objects.has(winningPath));assert.equal((await adminDb.collection('profiles').doc(luid).get()).get('avatar_url'),`storage://${winningPath}`);
  assert.equal((await avatar.screenAvatar.run(request(uid,{objectId:b}))).status,'accepted');
 }finally{core.bucket=originalBucket;Vision.prototype.safeSearchDetection=originalVision;}
});
test('avatar cleanup advances past current-only pages to old pending files',async()=>{
 const originalBucket=core.bucket;let calls=0,deleted=0;const pending=`avatars/${randomUUID()}/pending/${randomUUID()}.jpg`;
 core.bucket=()=>({getFiles:async options=>{calls++;return options.pageToken?[[{name:pending,metadata:{timeCreated:'2020-01-01T00:00:00Z'},delete:async()=>{deleted++;}}],null]:[[{name:'avatars/current-only/current/photo.jpg'}],{pageToken:'later'}];}});
 try{await adminDb.collection('system').doc('avatar_cleanup_cursor').delete();assert.equal(await avatar.purgeStalePendingAvatars(),1);assert.equal(calls,2);assert.equal(deleted,1);}finally{core.bucket=originalBucket;}
});

test('screening retries preserve a pending upload during in-flight and transient Vision failures',async()=>{
 const oldBucket=core.bucket,oldVision=Vision.prototype.safeSearchDetection,objects=new Set();let release,started;
 const io={name:'demo-avatar-only',file(name){return{name,exists:async()=>[objects.has(name)],copy:async target=>objects.add(target.name),setMetadata:async()=>{},delete:async()=>objects.delete(name)};}};
 core.bucket=()=>io;const barrier=new Promise(resolve=>{started=resolve;});Vision.prototype.safeSearchDetection=async()=>{started();await new Promise(resolve=>{release=resolve;});throw new Error('temporary Vision outage');};
 try{
  const uid=randomUUID(),luid=core.luidForUid(uid),id=randomUUID(),path=`avatars/${luid}/pending/${id}.jpg`;await profile(luid);objects.add(path);
  await adminDb.collection('avatar_uploads').doc(id).set({luid});await adminDb.collection('avatar_reviews').doc(luid).set({latest_object:path});
  const first=avatar.screenAvatar.run(request(uid,{objectId:id}));await barrier;
  await assert.rejects(avatar.screenAvatar.run(request(uid,{objectId:id})),error=>error.details?.reason==='busy_retry');assert.ok(objects.has(path));
  release();await assert.rejects(first,error=>error.details?.reason==='busy_retry');assert.ok(objects.has(path));assert.equal((await adminDb.collection('profiles').doc(luid).get()).get('avatar_url'),undefined);
  Vision.prototype.safeSearchDetection=async()=>[{safeSearchAnnotation:{adult:1,racy:1,violence:1,medical:1}}];
  assert.equal((await avatar.screenAvatar.run(request(uid,{objectId:id}))).status,'accepted');assert.ok(objects.has(`avatars/${luid}/current/${id}.jpg`));
 }finally{core.bucket=oldBucket;Vision.prototype.safeSearchDetection=oldVision;}
});

test('lost publish responses have an owner-fenced receipt before a committed world-map draft is reopened',async()=>{
 const owner=await newUser(),other=await newUser(),body=postBody();const created=await owner.call('createPost',body),post=adminDb.collection('posts').doc(created.post.id);
 await post.update({placement_state:'arkit_world_locked',world_map_path:`post-world-maps/${owner.luid}/${post.id}/original.lociarmap`});
 await assert.rejects(owner.call('beginWorldMapUpload',{postId:post.id}),error=>error.details?.reason==='draft_expired');
 const first=await readPublicContent.run(request(owner.uid,{mode:'own_receipt',postId:post.id}));assert.equal(first.receipt.postID,post.id);assert.equal(first.receipt.idempotentReplay,true);assert.equal(first.receipt.placementState,'arkit_world_locked');
 assert.deepEqual(await readPublicContent.run(request(owner.uid,{mode:'own_receipt',postId:post.id})),first);
 assert.equal((await readPublicContent.run(request(other.uid,{mode:'own_receipt',postId:post.id}))).receipt,null);
 assert.equal((await readPublicContent.run(request(owner.uid,{mode:'own_receipt',postId:randomUUID()}))).receipt,null);
});
