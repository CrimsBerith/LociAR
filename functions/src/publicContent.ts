import { onCall } from 'firebase-functions/v2/https';
import { db, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, Timestamp } from './core';
import { isPublicActive } from './counters';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import { info } from 'firebase-functions/logger';
import { requireActiveAccount } from './profileGuard';
import { createHash } from 'node:crypto';
import { rankForDiscover } from './discoverRanking';
import { anonymousGeometry, anonymousIdentity } from './anonymous';
import { campaignOffer, ownCampaignOffers } from './campaigns';
import { denseLocks, type SpotLock } from './denseSpots';

async function exclusions(luid:string){
  const pages = await Promise.all(['user_blocks', 'anonymous_blocks'].flatMap(collection => [db.collection(collection).where('blocker_id','==',luid).get(), db.collection(collection).where('blocked_id','==',luid).get()]));
  return new Set(pages.flatMap((page, index) => page.docs.map(d => String(d.get(index % 2 === 0 ? 'blocked_id' : 'blocker_id')))));
}
async function visibleAuthors(ids:string[],blocked:Set<string>){
  const unique=[...new Set(ids)].filter(id=>/^[0-9a-f-]{36}$/.test(id)&&!blocked.has(id));if(!unique.length)return new Set<string>();
  const docs=await db.getAll(...unique.flatMap(id=>[db.collection('profiles').doc(id),db.collection('account_deletion_jobs').doc(id)]));
  return new Set(unique.filter((_,i)=>docs[i*2].exists&&!docs[i*2].get('deleted_at')&&!docs[i*2].get('suspended')&&!docs[i*2+1].exists));
}
function json(value:unknown):unknown{
  if(value instanceof Timestamp)return value.toDate().toISOString();if(Array.isArray(value))return value.map(json);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,json(v)]));return value??null;
}
function embedded(value:unknown){try{return typeof value==='string'?JSON.parse(value):value??null;}catch{return null;}}
/** A dense-spot note shows only its place and the spot count until the viewer unlocks it on site. */
function row(doc:FirebaseFirestore.DocumentSnapshot, viewerId:string, lock?:SpotLock){
 const p=doc.data()!, anonymous=p.is_anonymous===true;
 if(lock)return json({...lockedRow(doc,viewerId,p,anonymous),locked:true,dense_spot:{id:lock.spot,count:lock.count,lat:lock.lat,lng:lock.lng,unlock_radius_m:lock.unlockRadius}});
 const geometry=(value:unknown)=>anonymous?anonymousGeometry(embedded(value),doc.id):embedded(value);
 return json({id:doc.id,...anonymousIdentity(doc.id,p.creator_id,viewerId,anonymous),
 creator_handle:anonymous?null:p.creator_handle??null,created_at:p.created_at,
 pose:geometry(p.pose_json),edit_data:embedded(p.edit_data_json),content_source:embedded(p.content_source_json),
 anchor_bundle:geometry(p.anchor_bundle_json),caption:p.caption??'', status:p.status,visibility:p.visibility,
 age_rating:p.age_rating??'all',views_count:p.views_count??0,likes_count:p.likes_count??0,comments_count:p.comments_count??0,note_kind:p.note_kind??null,notify_radius_m:p.notify_radius_m??null,push_state:p.push_state??null});
}
function lockedRow(doc:FirebaseFirestore.DocumentSnapshot,viewerId:string,p:FirebaseFirestore.DocumentData,anonymous:boolean){
 return{id:doc.id,...anonymousIdentity(doc.id,p.creator_id,viewerId,anonymous),creator_handle:anonymous?null:p.creator_handle??null,created_at:p.created_at,
 pose:anonymous?anonymousGeometry(embedded(p.pose_json),doc.id):embedded(p.pose_json),edit_data:{version:1,layers:[]},content_source:null,anchor_bundle:null,caption:'',
 status:p.status,visibility:p.visibility,age_rating:p.age_rating??'all',views_count:p.views_count??0,likes_count:p.likes_count??0,comments_count:p.comments_count??0,
 note_kind:p.note_kind??null,notify_radius_m:p.notify_radius_m??null,push_state:p.push_state??null};
}
const rows=async(docs:FirebaseFirestore.DocumentSnapshot[],viewerId:string)=>{const locks=await denseLocks(docs,viewerId);return docs.map(d=>row(d,viewerId,locks.get(d.id)));};
const fingerprint=(scope:unknown)=>createHash('sha256').update(JSON.stringify(scope)).digest('hex');
function cursor(doc:FirebaseFirestore.QueryDocumentSnapshot,scope:string){const date=doc.get('created_at');if(!(date instanceof Timestamp))throw new HttpsError('failed-precondition','Post timestamp unavailable');return Buffer.from(JSON.stringify({scope,id:doc.id,seconds:date.seconds,nanos:date.nanoseconds})).toString('base64url');}
function decode(value:unknown,scope:string):{id:string;date:Timestamp}|null{
 if(value==null)return null;try{if(typeof value!=='string'||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error();const c=JSON.parse(Buffer.from(value,'base64url').toString());
 if(c.scope!==scope||typeof c.id!=='string'||!c.id||c.id.includes('/')||!Number.isInteger(c.seconds)||!Number.isInteger(c.nanos)||c.nanos<0||c.nanos>=1e9)throw new Error();return{id:c.id,date:new Timestamp(c.seconds,c.nanos)};
 }catch{throw new HttpsError('invalid-argument','Invalid page cursor');}}
/** Public projections apply both block directions, legacy age checks and permanent deletion
 * fences. Incoming block records themselves never become readable by another client. */
export const readPublicContent=onCall({enforceAppCheck:ENFORCE_APP_CHECK,maxInstances:CALLABLE_MAX_INSTANCES,timeoutSeconds:60},async request=>{
 const caller=requireCaller(request);await db.runTransaction(tx=>requireActiveAccount(tx,caller.luid));const body=(request.data??{})as Record<string,unknown>,mode=String(body.mode??'discover');
 if(mode==='own_receipt'){
  const id=String(body.postId??'');if(!/^[0-9a-f-]{36}$/.test(id))throw new HttpsError('invalid-argument','Invalid post ID');
  return db.runTransaction(async tx=>{
   await requireActiveAccount(tx,caller.luid);const post=await tx.get(db.collection('posts').doc(id));
   return {receipt:post.exists&&post.get('creator_id')===caller.luid?{postID:id,status:post.get('status'),placementState:post.get('placement_state')??null,idempotentReplay:true}:null};
  });
 }
 const blocked=await exclusions(caller.luid);
 if(mode==='eligible_authors'){
  const ids=body.authorIds;if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)))throw new HttpsError('invalid-argument','Invalid author list');
  return {authorIds:[...await visibleAuthors(ids,blocked)]};
 }
 if(mode==='profile'){
  const id=String(body.creatorId??'');if(!(await visibleAuthors([id],blocked)).has(id))return{profile:null};const p=(await db.collection('profiles').doc(id).get()).data()!;
  return{profile:json({id,handle:p.handle,avatar_url:p.avatar_url??null,avatar_preset:p.avatar_preset??null,bio:p.bio??null,public_post_count:p.public_post_count??0,follower_count:p.follower_count??0,following_count:p.following_count??0})};
 }
 if(mode==='single'){
  const id=String(body.postId??'');if(!/^[0-9a-f-]{36}$/.test(id))throw new HttpsError('invalid-argument','Invalid post ID');const p=await db.collection('posts').doc(id).get();
  if(!p.exists){const offer=await db.runTransaction(tx=>campaignOffer(tx,caller.luid,id));return{posts:offer?[campaignRow(offer)]:[],next:null};}
  if(!isPublicActive(p.data())||!(await visibleAuthors([p.get('creator_id')],blocked)).has(p.get('creator_id')))return{posts:[],next:null};
  return{posts:await rows([p],caller.luid),next:null};
 }
 if(mode==='search_profiles'){
  const term=String(body.term??'').trim().toLowerCase().replace(/^@/,'');if(term.length<2||term.length>40)throw new HttpsError('invalid-argument','Invalid handle prefix');
  const page=await db.collection('profiles').where('handle','>=',term).where('handle','<=',term+'\uf8ff').orderBy('handle').limit(50).get(),visible=await visibleAuthors(page.docs.map(d=>d.id),blocked);
  return{profiles:page.docs.filter(d=>visible.has(d.id)).map(d=>({id:d.id,handle:String(d.get('handle')),avatar_url:d.get('avatar_url')??null,avatar_preset:d.get('avatar_preset')??null}))};
 }
 if(mode==='nearby'){
  const started=Date.now();
  const lat=body.latitude,lng=body.longitude,radius=body.radiusMeters;
  if(typeof lat!=='number'||!Number.isFinite(lat)||Math.abs(lat)>90||typeof lng!=='number'||!Number.isFinite(lng)||Math.abs(lng)>180||typeof radius!=='number'||!Number.isFinite(radius)||radius<1||radius>20_000_000)throw new HttpsError('invalid-argument','Invalid search area');
  // Turned on only after every legacy coordinate has been backfilled and verified.
  // Polar/whole-Earth searches retain the complete latitude-range fallback.
  const migrated=(await db.collection('system').doc('geo_queries').get()).get('geohash_index_version')===1;
  const prefixes=migrated?geohashCoverPrefixes(lat,lng,radius):[];
  const delta=radius/6_371_008.8*180/Math.PI;
  const queries=prefixes.length?prefixes.map(prefix=>db.collection('posts').orderBy('geohash').orderBy('__name__').startAt(prefix).endAt(prefix+'\uf8ff'))
   :[db.collection('posts').where('lat','>=',Math.max(-90,lat-delta)).where('lat','<=',Math.min(90,lat+delta)).orderBy('lat').orderBy('__name__')];
  let scanned=0;const candidates=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  for(const base of queries){
   let last:FirebaseFirestore.QueryDocumentSnapshot|undefined,complete=false;
   while(scanned<10_000){
    const limit=Math.min(250,10_000-scanned),page=await(last?base.startAfter(last):base).limit(limit).get();scanned+=page.size;
    for(const d of page.docs) if((isPublicActive(d.data())||d.get('creator_id')===caller.luid&&['active','pending_review','flagged'].includes(d.get('status'))&&!d.get('deleted_at')&&d.get('age_rating')!=='18_plus')&&distanceMeters(lat,lng,Number(d.get('lat')),Number(d.get('lng')))<=radius)candidates.set(d.id,d);
    if(page.size<limit){complete=true;break;}last=page.docs.at(-1);
   }
   if(!complete){info('nearby_query',{strategy:prefixes.length?'geohash':'latitude',scanned,elapsedMs:Date.now()-started,complete:false});throw new HttpsError('resource-exhausted','Search area is too dense; reduce the radius');}
  }
  const matches:FirebaseFirestore.QueryDocumentSnapshot[]=[];
  const found=[...candidates.values()];
  for(let i=0;i<found.length;i+=100){const batch=found.slice(i,i+100),authors=await visibleAuthors(batch.map(d=>d.get('creator_id')),blocked);matches.push(...batch.filter(d=>authors.has(d.get('creator_id'))));}
  matches.sort((a,b)=>Number(b.get('engagement_score')??0)-Number(a.get('engagement_score')??0)||distanceMeters(lat,lng,a.get('lat'),a.get('lng'))-distanceMeters(lat,lng,b.get('lat'),b.get('lng'))||a.id.localeCompare(b.id));
  const offers=await ownCampaignOffers(caller.luid,lat,lng,radius);
  info('nearby_query',{strategy:prefixes.length?'geohash':'latitude',scanned,matches:matches.length,elapsedMs:Date.now()-started,complete:true});
  return{posts:[...await rows(matches.slice(0,100),caller.luid),...offers.map(campaignRow)],next:null,total:matches.length+offers.length};
 }
 if(!['discover','creator'].includes(mode))throw new HttpsError('invalid-argument','Invalid content mode');const creator=mode==='creator'?String(body.creatorId??''):null;
 if(creator&&!(await visibleAuthors([creator],blocked)).has(creator))return{posts:[],next:null};const scope=fingerprint([caller.luid,mode,creator]),continuation=decode(body.cursor,scope);
 let query=db.collection('posts').where('status','==','active').where('visibility','==','public');if(creator)query=query.where('creator_id','==',creator);
 let ordered=query.orderBy('created_at','desc').orderBy('__name__','desc');if(continuation)ordered=ordered.startAfter(continuation.date,continuation.id);
 const page=await ordered.limit(51).get(),documents=page.docs.slice(0,50),authors=await visibleAuthors(documents.map(d=>d.get('creator_id')),blocked);
 // The cursor is taken from the chronological page; only the first discover page is re-ordered.
 const next=page.size>50?cursor(documents.at(-1)!,scope):null;
 const visible=documents.filter(d=>isPublicActive(d.data())&&authors.has(d.get('creator_id'))&&(!creator||creator===caller.luid||d.get('is_anonymous')!==true));
 const ordering=mode==='discover'&&!continuation?rankForDiscover(visible,d=>({engagement:d.get('engagement_score'),createdAtMs:d.get('created_at') instanceof Timestamp?d.get('created_at').toMillis():null}),Date.now()):visible;
 return{posts:await rows(ordering,caller.luid),next};
});

function campaignRow(p:FirebaseFirestore.DocumentData){return json({id:p.id,creator_id:p.creator_id,creator_handle:p.creator_handle,
 created_at:p.created_at,pose:embedded(p.pose_json),edit_data:embedded(p.edit_data_json),content_source:null,
 anchor_bundle:embedded(p.anchor_bundle_json),caption:p.caption,status:'active',visibility:'private',age_rating:'all',
 views_count:p.views_count,likes_count:0,comments_count:0,is_anonymous:false,sponsorship:p.sponsorship});}
