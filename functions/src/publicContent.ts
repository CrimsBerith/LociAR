import { chunks, forEachSequential, readPages } from './async';
import { scalarText } from './values';
import { onCall } from 'firebase-functions/v2/https';
import { db, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, Timestamp, FieldValue, isUUID } from './core';
import { isPublicActive } from './counters';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import { info } from 'firebase-functions/logger';
import { requireActiveAccount } from './profileGuard';
import { createHash, randomUUID } from 'node:crypto';
import { rankForDiscover } from './discoverRanking';
import { anonymousGeometry, anonymousIdentity, publicEditData } from './anonymous';
import { campaignOffer, ownCampaignOffers } from './campaigns';
import { denseLocks, spotSettings, type SpotLock } from './denseSpots';
import { mapNoteGroups } from './mapNoteGroups';
import { validCoordinates, UNLOCK_TTL_MS, SPOT_JOIN_RADIUS_M, type Fix } from './placeNoteRules';
import { postHiddenByBlocks, type BlockSets } from './visibility';
import { MEMORY_LIMITS_ENABLED, WindowLimiter } from './memoryLimits';
import { reasonError } from './errors';

/**
 * The app asks for 120 m (AR) and 1 km (map). Larger areas are clamped and each request scans a
 * bounded number of rows, so a scripted client cannot turn one call into thousands of billed reads.
 */
export const MAX_NEARBY_RADIUS_M = 5_000;
export const MAX_NEARBY_SCAN = 5_000;
const nearbyLimiter = new WindowLimiter(30, 60_000);
const edgePageLimiter = new WindowLimiter(60, 60_000);

/** Identity blocks work in both directions; an anonymous mute only for the viewer who set it. */
async function exclusions(luid:string):Promise<BlockSets>{
  const [blocking,blockedBy,muted]=await Promise.all([db.collection('user_blocks').where('blocker_id','==',luid).get(),
   db.collection('user_blocks').where('blocked_id','==',luid).get(),db.collection('anonymous_blocks').where('blocker_id','==',luid).get()]);
  return {identity:new Set([...blocking.docs.map(d=>String(d.get('blocked_id'))),...blockedBy.docs.map(d=>String(d.get('blocker_id')))]),
   muted:new Set(muted.docs.map(d=>String(d.get('blocked_id'))))};
}
async function visibleAuthors(ids:string[],blocked:ReadonlySet<string>){
  const unique=[...new Set(ids)].filter(id=>/^[0-9a-f-]{36}$/.test(id)&&!blocked.has(id));if(!unique.length){ return new Set<string>(); }
  const visible = new Set<string>();
  // Deduplicate across the entire request, then bound RPC batches by unique authors.
  // No authorization result survives this request or hides a later suspension/deletion.
  await forEachSequential(chunks(unique, 100), async batch => {
    const docs=await db.getAll(...batch.flatMap(id=>[db.collection('profiles').doc(id),db.collection('account_deletion_jobs').doc(id)]));
    batch.forEach((id,i)=>{if(docs[i*2].exists&&!docs[i*2].get('deleted_at')&&!docs[i*2].get('suspended')&&!docs[i*2+1].exists) visible.add(id);});
  });
  return visible;
}
/** Account fences for every post, then the block rule that matches the post's kind (visibility.ts). */
async function visiblePosts<T extends FirebaseFirestore.DocumentSnapshot>(docs:T[],blocks:BlockSets,viewer:string):Promise<T[]>{
  const authors=await visibleAuthors(docs.map(d=>String(d.get('creator_id'))),new Set());
  return docs.filter(d=>{const author=String(d.get('creator_id'));return authors.has(author)&&!postHiddenByBlocks(viewer,author,d.get('is_anonymous')===true,blocks);});
}
function json(value:unknown):unknown{
  if(value instanceof Timestamp){ return value.toDate().toISOString(); }if(Array.isArray(value)){ return value.map(json); }
  if(value&&typeof value==='object'){ return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,json(v)])); }return value??null;
}
function embedded(value:unknown){try{return typeof value==='string'?JSON.parse(value):value??null;}catch{return null;}}
/** A dense-spot note shows only its place and the spot count until the viewer unlocks it on site. */
function row(doc:FirebaseFirestore.DocumentSnapshot, viewerId:string, lock?:SpotLock){
 const p=doc.data()!, anonymous=p.is_anonymous===true;
 if(lock){ return json({...lockedRow(doc,viewerId,p,anonymous),locked:true,dense_spot:{id:lock.spot,count:lock.count,lat:lock.lat,lng:lock.lng,unlock_radius_m:lock.unlockRadius,group_id:lock.groupId??`spot:${lock.spot}`}}); }
 const geometry=(value:unknown)=>anonymous?anonymousGeometry(embedded(value),doc.id):embedded(value);
 return json({id:doc.id,...anonymousIdentity(doc.id,p.creator_id,viewerId,anonymous),
 creator_handle:anonymous?null:p.creator_handle??null,created_at:p.created_at,
 pose:geometry(p.pose_json),edit_data:publicEditData(embedded(p.edit_data_json)),content_source:null,
 anchor_bundle:geometry(p.anchor_bundle_json),caption:p.caption??'', status:p.status,visibility:p.visibility,
 age_rating:p.age_rating??'all',views_count:p.views_count??0,likes_count:p.likes_count??0,comments_count:p.comments_count??0,note_kind:p.note_kind??null,notify_radius_m:p.notify_radius_m??null,push_state:p.push_state??null,admin_managed:p.admin_managed===true});
}
function lockedRow(doc:FirebaseFirestore.DocumentSnapshot,viewerId:string,p:FirebaseFirestore.DocumentData,anonymous:boolean){
 return{id:doc.id,...anonymousIdentity(doc.id,p.creator_id,viewerId,anonymous),creator_handle:anonymous?null:p.creator_handle??null,created_at:p.created_at,
 pose:anonymous?anonymousGeometry(embedded(p.pose_json),doc.id):embedded(p.pose_json),edit_data:{version:1,layers:[]},content_source:null,anchor_bundle:null,caption:'',
 status:p.status,visibility:p.visibility,age_rating:p.age_rating??'all',views_count:p.views_count??0,likes_count:p.likes_count??0,comments_count:p.comments_count??0,
 note_kind:p.note_kind??null,notify_radius_m:p.notify_radius_m??null,push_state:p.push_state??null,admin_managed:p.admin_managed===true};
}
const rows=async(docs:FirebaseFirestore.DocumentSnapshot[],viewerId:string,fix?:Fix,area?:Parameters<typeof denseLocks>[3])=>{const locks=await denseLocks(docs,viewerId,fix,area);return docs.map(d=>row(d,viewerId,locks.get(d.id)));};
const fingerprint=(scope:unknown)=>createHash('sha256').update(JSON.stringify(scope)).digest('hex');
function cursor(doc:FirebaseFirestore.QueryDocumentSnapshot,scope:string){const date=doc.get('created_at');if(!(date instanceof Timestamp)){ throw new HttpsError('failed-precondition','Post timestamp unavailable'); }return Buffer.from(JSON.stringify({scope,id:doc.id,seconds:date.seconds,nanos:date.nanoseconds})).toString('base64url');}
function decode(value:unknown,scope:string):{id:string;date:Timestamp}|null{
 if(value==null){ return null; }try{if(typeof value!=='string'||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value)){ throw new Error('Invalid public-content cursor'); }const c=JSON.parse(Buffer.from(value,'base64url').toString());
 if(c.scope!==scope||typeof c.id!=='string'||!c.id||c.id.includes('/')||!Number.isInteger(c.seconds)||!Number.isInteger(c.nanos)||c.nanos<0||c.nanos>=1e9){ throw new Error('Invalid public-content cursor'); }return{id:c.id,date:new Timestamp(c.seconds,c.nanos)};
 }catch{throw new HttpsError('invalid-argument','Invalid page cursor');}}
/** Public projections apply both block directions, legacy age checks and permanent deletion
 * fences. Incoming block records themselves never become readable by another client. */
export const readPublicContent=onCall({enforceAppCheck:ENFORCE_APP_CHECK,maxInstances:CALLABLE_MAX_INSTANCES,timeoutSeconds:60},async request=>{
 const caller=requireCaller(request);const body=(request.data??{})as Record<string,unknown>,mode=scalarText(body.mode??'discover');
 if (mode === 'own_receipt') return readOwnReceipt(body, caller.luid);
 if (!['eligible_authors', 'profile', 'single', 'search_profiles', 'nearby', 'map_groups', 'map_group', 'saved', 'collection', 'discover', 'creator'].includes(mode)) {
   throw new HttpsError('invalid-argument', 'Invalid content mode');
 }
 await db.runTransaction(tx=>requireActiveAccount(tx,caller.luid));
 if (mode === 'saved' || mode === 'collection') return readEdgePage(body, caller.luid, mode === 'collection');
 const blocked = await exclusions(caller.luid);
 switch (mode) {
 case 'eligible_authors': return readEligibleAuthors(body, blocked);
 case 'profile': return readProfile(body, blocked);
 case 'single': return readSinglePost(body, caller.luid, blocked);
 case 'search_profiles': return searchProfiles(body, blocked);
 case 'nearby': return readNearbyPosts(body, caller.luid, blocked);
 case 'map_groups': return readMapGroups(body, caller.luid, blocked);
 case 'map_group': return readMapGroup(body, caller.luid, blocked);
 default: return readFeed(body, caller.luid, blocked, mode);
 }
});

function campaignRow(p:FirebaseFirestore.DocumentData){return json({id:p.id,creator_id:p.creator_id,creator_handle:p.creator_handle,
 created_at:p.created_at,pose:embedded(p.pose_json),edit_data:embedded(p.edit_data_json),content_source:null,
 anchor_bundle:embedded(p.anchor_bundle_json),caption:p.caption,status:'active',visibility:'private',age_rating:'all',
 views_count:p.views_count,likes_count:0,comments_count:0,is_anonymous:false,sponsorship:p.sponsorship});}


async function readOwnReceipt(body: Record<string, unknown>, luid: string) {
const id=scalarText(body.postId??'');if(!/^[0-9a-f-]{36}$/.test(id)){ throw new HttpsError('invalid-argument','Invalid post ID'); }
  return await db.runTransaction(async tx=>{
   await requireActiveAccount(tx,luid);const post=await tx.get(db.collection('posts').doc(id));
   return {receipt:post.exists&&post.get('creator_id')===luid?{postID:id,status:post.get('status'),placementState:post.get('placement_state')??null,idempotentReplay:true}:null};
  });
}

async function readEligibleAuthors(body: Record<string, unknown>, blocked: BlockSets) {
const ids=body.authorIds;if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))){ throw new HttpsError('invalid-argument','Invalid author list'); }
  return {authorIds:[...await visibleAuthors(ids,blocked.identity)]};
}

async function readProfile(body: Record<string, unknown>, blocked: BlockSets) {
const id=scalarText(body.creatorId??'');if(!(await visibleAuthors([id],blocked.identity)).has(id)){ return{profile:null}; }const p=(await db.collection('profiles').doc(id).get()).data()!;
  return{profile:json({id,handle:p.handle,avatar_url:p.avatar_url??null,avatar_preset:p.avatar_preset??null,bio:p.bio??null,public_post_count:p.public_post_count??0,follower_count:p.follower_count??0,following_count:p.following_count??0})};
}

async function readSinglePost(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
const id=scalarText(body.postId??'');if(!/^[0-9a-f-]{36}$/.test(id)){ throw new HttpsError('invalid-argument','Invalid post ID'); }const p=await db.collection('posts').doc(id).get();
  if(!p.exists){const offer=await db.runTransaction(tx=>campaignOffer(tx,luid,id));return{posts:offer?[campaignRow(offer)]:[],next:null};}
  if(!isPublicActive(p.data())||!(await visiblePosts([p],blocked,luid)).length){ return{posts:[],next:null}; }
  return{posts:await rows([p],luid),next:null};
}

/** Page the raw owned edges, then batch the same public projection used by single-post reads.
 * Cursors advance even when every row was removed/blocked/locked; no N-callable fan-out.
 */
async function readEdgePage(body: Record<string, unknown>, luid: string, collection: boolean) {
  if (MEMORY_LIMITS_ENABLED && !edgePageLimiter.allow(luid)) throw reasonError('resource-exhausted', 'Too many list requests', 'rate_limited');
  const collectionId = collection ? scalarText(body.collectionId ?? '') : null;
  if (collection && !isUUID(collectionId)) throw new HttpsError('invalid-argument', 'Invalid collection ID');
  const empty = { posts: [], next: null, edgePageVersion: 1 };
  if (collection) {
    const owned = await db.collection('collections').doc(collectionId!).get();
    if (!owned.exists || owned.get('owner_id') !== luid) return empty;
  }
  const scope = fingerprint({ version: 1, luid, collectionId, mode: collection ? 'collection' : 'saved' });
  let position: { id: string; sort?: number } | null = null;
  if (body.cursor != null) {
    try {
      if (typeof body.cursor !== 'string' || body.cursor.length > 2048 || !/^[\w-]+$/.test(body.cursor)) throw new Error();
      const decoded = JSON.parse(Buffer.from(body.cursor, 'base64url').toString());
      if (decoded.scope !== scope || typeof decoded.id !== 'string' || !decoded.id || decoded.id.includes('/')
        || collection && !Number.isFinite(decoded.sort)) throw new Error();
      position = decoded;
    } catch { throw new HttpsError('invalid-argument', 'Invalid edge cursor'); }
  }
  let query = collection
    ? db.collection('collection_items').where('collection_id', '==', collectionId).where('owner_id', '==', luid).orderBy('sort_order').orderBy('__name__')
    : db.collection('post_saves').where('user_id', '==', luid).orderBy('__name__');
  if (position) query = collection ? query.startAfter(position.sort, position.id) : query.startAfter(position.id);
  const page = await query.limit(16).get(), edges = page.docs.slice(0, 15);
  const ids = [...new Set(edges.map(edge => edge.get('post_id')).filter((id): id is string => isUUID(id)))];
  const documents = ids.length ? await db.getAll(...ids.map(id => db.collection('posts').doc(id))) : [];
  const active = documents.filter(doc => doc.exists && isPublicActive(doc.data()));
  const readable = active.length ? await visiblePosts(active, await exclusions(luid), luid) : [];
  const last = edges.at(-1);
  const next = page.size > 15 && last ? Buffer.from(JSON.stringify({ scope, id: last.id,
    ...(collection ? { sort: last.get('sort_order') } : {}) })).toString('base64url') : null;
  return { posts: await rows(readable, luid), next, edgePageVersion: 1 };
}

async function searchProfiles(body: Record<string, unknown>, blocked: BlockSets) {
const term=scalarText(body.term??'').trim().toLowerCase().replace(/^@/,'');if(term.length<2||term.length>40){ throw new HttpsError('invalid-argument','Invalid handle prefix'); }
  const page=await db.collection('profiles').where('handle','>=',term).where('handle','<=',term+'\uf8ff').orderBy('handle').limit(50).get(),visible=await visibleAuthors(page.docs.map(d=>d.id),blocked.identity);
  return{profiles:page.docs.filter(d=>visible.has(d.id)).map(d=>({id:d.id,handle:String(d.get('handle')),avatar_url:d.get('avatar_url')??null,avatar_preset:d.get('avatar_preset')??null}))};
}

async function nearbyDocuments(body: Record<string, unknown>, luid: string, blocked: BlockSets, chargeLimit = true) {
const started=Date.now();
  const lat=body.latitude,lng=body.longitude,requested=body.radiusMeters;
  if(typeof lat!=='number'||!Number.isFinite(lat)||Math.abs(lat)>90||typeof lng!=='number'||!Number.isFinite(lng)||Math.abs(lng)>180||typeof requested!=='number'||!Number.isFinite(requested)||requested<1||requested>20_000_000){ throw new HttpsError('invalid-argument','Invalid search area'); }
  if(chargeLimit&&MEMORY_LIMITS_ENABLED&&!nearbyLimiter.allow(luid)){ throw reasonError('resource-exhausted','Too many map requests; try again shortly','rate_limited'); }
  const radius=Math.min(requested,MAX_NEARBY_RADIUS_M);
  // Turned on only after every legacy coordinate has been backfilled and verified.
  // Polar/whole-Earth searches retain the complete latitude-range fallback.
  const migrated=(await db.collection('system').doc('geo_queries').get()).get('geohash_index_version')===1;
  const prefixes=migrated?geohashCoverPrefixes(lat,lng,radius):[];
  const delta=radius/6_371_008.8*180/Math.PI;
  const queries=prefixes.length?prefixes.map(prefix=>db.collection('posts').orderBy('geohash').orderBy('__name__').startAt(prefix).endAt(prefix+'\uf8ff'))
   :[db.collection('posts').where('lat','>=',Math.max(-90,lat-delta)).where('lat','<=',Math.min(90,lat+delta)).orderBy('lat').orderBy('__name__')];
  let scanned=0;const candidates=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  await forEachSequential(queries, async (base) => {
   const pages = readPages(async (last: FirebaseFirestore.QueryDocumentSnapshot | undefined) => {
    if (scanned >= MAX_NEARBY_SCAN) {
     info('nearby_query', { strategy: prefixes.length ? 'geohash' : 'latitude', scanned, elapsedMs: Date.now() - started, complete: false });
     throw new HttpsError('resource-exhausted', 'Search area is too dense; reduce the radius');
    }
    const limit = Math.min(250, MAX_NEARBY_SCAN - scanned);
    const page = await (last ? base.startAfter(last) : base).limit(limit).get();
    scanned += page.size;
    return { value: page, next: page.size < limit ? undefined : page.docs.at(-1) };
   });
   for await (const page of pages) {
    for (const doc of page.docs) {
     if (nearbyCandidate(doc, luid, lat, lng, radius)) candidates.set(doc.id, doc);
    }
   }
  });
  const found=[...candidates.values()];
  const matches=await visiblePosts(found, blocked, luid);
  // Distance selects the nearby set; popularity orders notes at a place in the native panel.
  matches.sort((a,b)=>distanceMeters(lat,lng,a.get('lat'),a.get('lng'))-distanceMeters(lat,lng,b.get('lat'),b.get('lng'))||Number(b.get('likes_count')??0)-Number(a.get('likes_count')??0)||a.id.localeCompare(b.id));
  info('nearby_query',{strategy:prefixes.length?'geohash':'latitude',scanned,matches:matches.length,elapsedMs:Date.now()-started,complete:true});
  return { matches, physical: found, lat, lng, radius };
}

async function readNearbyPosts(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const { matches, lat, lng, radius } = await nearbyDocuments(body, luid, blocked);
  const offers = await ownCampaignOffers(luid, lat, lng, radius);
  const selected = new Map(matches.slice(0, 100).map(post => [post.id, post]));
  if (body.includeOwnNearby === true) {
    // Already in the complete, distance-filtered candidate set. Preserve up to 50 nearby own
    // drafts/posts even when 100 closer public rows fill the page, without a second own feed.
    const own = matches.filter(post => post.get('creator_id') === luid).sort((a, b) =>
      Number(b.get('created_at')?.toMillis?.() ?? 0) - Number(a.get('created_at')?.toMillis?.() ?? 0) || a.id.localeCompare(b.id));
    own.slice(0, 50).forEach(post => selected.set(post.id, post));
  }
  return { posts: [...await rows([...selected.values()], luid), ...offers.map(campaignRow)], next: null, total: matches.length + offers.length };
}

async function readMapGroups(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const radiusMeters = Math.min(Number(body.radiusMeters), 2_000);
  const { matches, lat, lng } = await nearbyDocuments({ ...body, radiusMeters }, luid, blocked);
  const groups = mapNoteGroups(matches.filter(d => isPublicActive(d.data())).map(d => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), spotId: d.get('spot_id') })));
  const { unlockRadius } = await spotSettings();
  // No caption, media, author or likes are returned by the map-summary surface.
  return { groups, unlockRadius, summaryVersion: 1, complete: true,
    coverage: { latitude: lat, longitude: lng, radiusMeters } };
}

const MAP_GROUP_ID = /^(spot|post):([0-9a-f-]{36})$/;
const POST_ID = /^[0-9a-f-]{36}$/;
const MAP_GROUP_MEMBERSHIP_VERSION = 2;

/** Resolve a stale small-group identity through its current anchor membership. */
export async function visibleMapDocuments(docs: FirebaseFirestore.DocumentSnapshot[], luid: string, blocked: BlockSets) {
  return visiblePosts(docs.filter(d => d.exists && isPublicActive(d.data())
    && validCoordinates(d.get('lat'), d.get('lng'))), blocked, luid);
}

async function visibleMapAnchor(id: string, hints: string[], luid: string, blocked: BlockSets) {
  const anchor = await db.collection('posts').doc(id).get();
  // Geometry is physical, not viewer-dependent. A block may remove a returned row, never
  // choose a new centre that grants access to someone else's anonymous note.
  if (anchor.exists && isPublicActive(anchor.data()) && validCoordinates(anchor.get('lat'), anchor.get('lng'))) return anchor;
  // Hints choose an eligible replacement only; all membership is still server-derived.
  const replacements: FirebaseFirestore.DocumentSnapshot[] = [];
  await forEachSequential(chunks(hints.filter(value => value !== id), 100), async ids => {
    replacements.push(...await db.getAll(...ids.map(value => db.collection('posts').doc(value))));
  });
  const visible = await visibleMapDocuments(replacements, luid, blocked);
  visible.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return visible[0];
}

async function mapGroupDocuments(groupId: string, hints: string[], luid: string, blocked: BlockSets) {
  const group = MAP_GROUP_ID.exec(groupId)!;
  let canonicalId = groupId;
  let anchorId: string | undefined;
  let found: FirebaseFirestore.DocumentSnapshot[] = [];
  if (group[1] === 'post') {
    const anchor = await visibleMapAnchor(group[2], hints, luid, blocked);
    if (!anchor) return { canonicalId, allowed: [], candidateCount: 0, summary: null };
    anchorId = anchor.id;
    canonicalId = `post:${anchor.id}`;
    const spot = anchor.get('spot_id');
    if (typeof spot === 'string' && POST_ID.test(spot)) canonicalId = `spot:${spot}`;
    else {
      // Membership is server-derived. A side-panel singleton or an outdated client member
      // list cannot silently omit the other notes belonging to this real place.
      const { physical } = await nearbyDocuments({ latitude: anchor.get('lat'), longitude: anchor.get('lng'),
        radiusMeters: SPOT_JOIN_RADIUS_M }, luid, blocked, false);
      const assigned = physical.find(d => d.id === anchor.id)?.get('spot_id');
      if (typeof assigned === 'string' && POST_ID.test(assigned)) canonicalId = `spot:${assigned}`;
      else found = physical.filter(d => !d.get('spot_id'));
    }
  }
  if (canonicalId.startsWith('spot:')) {
    const snapshot = await db.collection('posts').where('spot_id', '==', canonicalId.slice(5)).limit(MAX_NEARBY_SCAN + 1).get();
    if (snapshot.size > MAX_NEARBY_SCAN) throw new HttpsError('resource-exhausted', 'Map group is too large');
    found = snapshot.docs;
  }
  // Split old broad spots in memory only. Reading a map never migrates persisted membership.
  // Partition before visibility: profile blocks cannot move an anonymous group's access circle.
  const physical = found.filter(d => d.exists && isPublicActive(d.data()) && validCoordinates(d.get('lat'), d.get('lng')));
  const groups = mapNoteGroups(physical.map(d => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), spotId: d.get('spot_id') })));
  const canonical = groups.find(g => anchorId ? g.post_ids.includes(anchorId) : g.id === canonicalId) ?? null;
  canonicalId = canonical?.id ?? canonicalId;
  const members = new Set(canonical?.post_ids ?? []);
  const allowed = await visibleMapDocuments(physical.filter(d => members.has(d.id)), luid, blocked);
  const summary = canonical && allowed.length ? { ...canonical, count: allowed.length, post_ids: allowed.map(d => d.id) } : null;
  return { canonicalId, allowed, candidateCount: found.length, summary };
}

function mapGroupPageInput(body: Record<string, unknown>) {
  const requestedId = body.groupId;
  const offset = body.offset ?? 0, token = body.pageToken, hints = body.postIds ?? [], pageSize = body.pageSize ?? 50;
  if (typeof requestedId !== 'string' || !MAP_GROUP_ID.test(requestedId)
    || !Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > MAX_NEARBY_SCAN
    || (token != null && (typeof token !== 'string' || !POST_ID.test(token))) || (Number(offset) > 0 && !token)
    || !Number.isSafeInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 50
    || !Array.isArray(hints) || hints.length > MAX_NEARBY_SCAN || hints.some(id => typeof id !== 'string' || !POST_ID.test(id))) {
    throw new HttpsError('invalid-argument', 'Invalid map group page');
  }
  return { requestedId, offset: Number(offset), token: typeof token === 'string' ? token : undefined, hints, pageSize: Number(pageSize) };
}

async function mapGroupSession(luid: string, requestedId: string, token: string | undefined) {
  if (!token) return undefined;
  const session = await db.collection('map_group_sessions').doc(token).get();
  if (!session.exists || session.get('owner_luid') !== luid
    || session.get('membership_version') !== MAP_GROUP_MEMBERSHIP_VERSION
    || ![session.get('requested_group_id'), session.get('group_id')].includes(requestedId)
    || !(session.get('expires_at') instanceof Timestamp) || session.get('expires_at').toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Map group page expired; refresh the group');
  }
  return session;
}

async function readMapGroup(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const started = Date.now();
  const { requestedId, offset, token, hints, pageSize } = mapGroupPageInput(body);
  if (MEMORY_LIMITS_ENABLED && !nearbyLimiter.allow(luid)) throw reasonError('resource-exhausted', 'Too many map requests; try again shortly', 'rate_limited');
  const session = await mapGroupSession(luid, requestedId, token);
  const { canonicalId, allowed, candidateCount, summary: group } = await mapGroupDocuments(session?.get('group_id') ?? requestedId,
    session?.get('post_ids') ?? [...new Set(hints)], luid, blocked);
  if (session && session.get('group_id') !== canonicalId) await session.ref.update({ group_id: canonicalId });
  allowed.sort((a, b) => Number(b.get('likes_count') ?? 0) - Number(a.get('likes_count') ?? 0)
    || (b.get('created_at')?.toMillis?.() ?? 0) - (a.get('created_at')?.toMillis?.() ?? 0) || a.id.localeCompare(b.id, 'en'));
  const area = group ? { ...group, id: canonicalId.slice(5), groupId: canonicalId } : undefined;
  // Freeze the ordered IDs, never text or an access grant. Later pages recheck current
  // membership, blocks, account fences and fresh on-site location before serializing bodies.
  const order: string[] = session ? session.get('post_ids') : allowed.map(d => d.id);
  const byId = new Map(allowed.map(d => [d.id, d]));
  const start = Number(offset), end = start + pageSize;
  const page = order.slice(start, end).flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const posts = await rows(page, luid, body.location as Fix | undefined, area);
  const nextOffset = end < order.length ? end : null;
  let pageToken: string | null = typeof token === 'string' ? token : null;
  if (nextOffset != null && !pageToken) {
    pageToken = randomUUID();
    await db.collection('map_group_sessions').doc(pageToken).set({ owner_luid: luid,
      membership_version: MAP_GROUP_MEMBERSHIP_VERSION,
      requested_group_id: requestedId, group_id: canonicalId, post_ids: order,
      created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + UNLOCK_TTL_MS) });
  }
  // Comments use Firestore rules. This location-free receipt cannot unlock note bodies.
  const readable = posts as Array<{ id: string; locked?: boolean; note_kind?: string }>;
  const notes = readable.filter(post => post.note_kind === 'location' && !post.locked);
  if (notes.length) {
    const batch = db.batch();
    for (const post of notes) batch.set(db.collection('dense_spot_unlocks').doc(`${luid}_note_${post.id}`), {
      owner_luid: luid, post_id: post.id, kind: 'note_read', created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + UNLOCK_TTL_MS),
    });
    await batch.commit();
  }
  info('map_group_page', { candidatePosts: candidateCount, visiblePosts: allowed.length,
    pagePosts: page.length, pageSize, continuation: !!session, elapsedMs: Date.now() - started });
  return { posts, nextOffset, pageToken, total: order.filter(id => byId.has(id)).length, group };
}

async function readFeed(body: Record<string, unknown>, luid: string, blocked: BlockSets, mode: string) {
if(!['discover','creator'].includes(mode)){ throw new HttpsError('invalid-argument','Invalid content mode'); }const creator=mode==='creator'?scalarText(body.creatorId??''):null;
 if(creator&&!(await visibleAuthors([creator],blocked.identity)).has(creator)){ return{posts:[],next:null}; }const scope=fingerprint([luid,mode,creator]),continuation=decode(body.cursor,scope);
 const otherCreator=creator!=null&&creator!==luid;
 let query=db.collection('posts').where('status','==','active').where('visibility','==','public');if(creator){ query=query.where('creator_id','==',creator); }
 if(otherCreator){ query=query.where('is_anonymous','==',false); }
 let ordered=query.orderBy('created_at','desc').orderBy('__name__','desc');if(continuation){ ordered=ordered.startAfter(continuation.date,continuation.id); }
 const page=await ordered.limit(51).get(),documents=page.docs.slice(0,50),allowed=new Set((await visiblePosts(documents,blocked,luid)).map(d=>d.id));
 const visible=documents.filter(d=>isPublicActive(d.data())&&allowed.has(d.id)&&(!otherCreator||d.get('is_anonymous')!==true));
 const raw=documents.at(-1);
 const anchor=visible.at(-1)??(page.size>50&&raw&&(!otherCreator||raw.get('is_anonymous')!==true)?raw:undefined);
 const next=page.size>50&&anchor?cursor(anchor,scope):null;
 const ordering=mode==='discover'&&!continuation?rankForDiscover(visible,d=>({engagement:d.get('engagement_score'),createdAtMs:d.get('created_at') instanceof Timestamp?d.get('created_at').toMillis():null}),Date.now()):visible;
 return{posts:await rows(ordering,luid),next};
}

function nearbyCandidate(doc: FirebaseFirestore.QueryDocumentSnapshot, luid: string, lat: number, lng: number, radius: number): boolean {
 const ownerVisible = doc.get('creator_id') === luid && ['active', 'pending_review', 'flagged'].includes(doc.get('status'))
  && !doc.get('deleted_at') && doc.get('age_rating') !== '18_plus';
 return (isPublicActive(doc.data()) || ownerVisible)
  && distanceMeters(lat, lng, Number(doc.get('lat')), Number(doc.get('lng'))) <= radius;
}
