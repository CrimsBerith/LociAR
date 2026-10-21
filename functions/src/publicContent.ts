import { chunks, forEachSequential, readPages } from './async';
import { scalarText } from './values';
import { onCall } from 'firebase-functions/v2/https';
import { db, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, Timestamp, FieldValue } from './core';
import { isPublicActive } from './counters';
import { distanceMeters, geohashCoverPrefixes } from './geo';
import { info } from 'firebase-functions/logger';
import { requireActiveAccount } from './profileGuard';
import { createHash, randomUUID } from 'node:crypto';
import { rankForDiscover } from './discoverRanking';
import { anonymousGeometry, anonymousIdentity, publicEditData } from './anonymous';
import { campaignOffer, ownCampaignOffers } from './campaigns';
import { denseLocks, spotSettings, type SpotLock } from './denseSpots';
import { mapGroupSummary, mapNoteGroups } from './mapNoteGroups';
import { validCoordinates, UNLOCK_TTL_MS, SPOT_JOIN_RADIUS_M, type Fix } from './placeNoteRules';
import { postHiddenByBlocks, type BlockSets } from './visibility';
import { MEMORY_LIMITS_ENABLED, WindowLimiter } from './memoryLimits';
import { reasonError } from './errors';
import { mapCellCandidates, mapCellsEnabled, MAP_CELL_MAX_RADIUS_M } from './mapCells';

/**
 * The app asks for 120 m (AR) and 1 km (map). Larger areas are clamped and each request scans a
 * bounded number of rows, so a scripted client cannot turn one call into thousands of billed reads.
 */
export const MAX_NEARBY_RADIUS_M = 5_000;
export const MAX_NEARBY_SCAN = 5_000;
const nearbyLimiter = new WindowLimiter(30, 60_000);

/** Identity blocks work in both directions; an anonymous mute only for the viewer who set it. */
async function exclusions(luid:string):Promise<BlockSets>{
  const [blocking,blockedBy,muted]=await Promise.all([db.collection('user_blocks').where('blocker_id','==',luid).get(),
   db.collection('user_blocks').where('blocked_id','==',luid).get(),db.collection('anonymous_blocks').where('blocker_id','==',luid).get()]);
  return {identity:new Set([...blocking.docs.map(d=>String(d.get('blocked_id'))),...blockedBy.docs.map(d=>String(d.get('blocker_id')))]),
   muted:new Set(muted.docs.map(d=>String(d.get('blocked_id'))))};
}
async function visibleAuthors(ids:string[],blocked:ReadonlySet<string>){
  const unique=[...new Set(ids)].filter(id=>/^[0-9a-f-]{36}$/.test(id)&&!blocked.has(id));if(!unique.length){ return new Set<string>(); }
  const docs=await db.getAll(...unique.flatMap(id=>[db.collection('profiles').doc(id),db.collection('account_deletion_jobs').doc(id)]));
  return new Set(unique.filter((_,i)=>docs[i*2].exists&&!docs[i*2].get('deleted_at')&&!docs[i*2].get('suspended')&&!docs[i*2+1].exists));
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
 const caller=requireCaller(request);await db.runTransaction(tx=>requireActiveAccount(tx,caller.luid));const body=(request.data??{})as Record<string,unknown>,mode=scalarText(body.mode??'discover');
 if (mode === 'own_receipt') return readOwnReceipt(body, caller.luid);
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

async function searchProfiles(body: Record<string, unknown>, blocked: BlockSets) {
const term=scalarText(body.term??'').trim().toLowerCase().replace(/^@/,'');if(term.length<2||term.length>40){ throw new HttpsError('invalid-argument','Invalid handle prefix'); }
  const page=await db.collection('profiles').where('handle','>=',term).where('handle','<=',term+'\uf8ff').orderBy('handle').limit(50).get(),visible=await visibleAuthors(page.docs.map(d=>d.id),blocked.identity);
  return{profiles:page.docs.filter(d=>visible.has(d.id)).map(d=>({id:d.id,handle:String(d.get('handle')),avatar_url:d.get('avatar_url')??null,avatar_preset:d.get('avatar_preset')??null}))};
}

type SearchArea = { lat: number; lng: number; radius: number };

/** Validates the requested circle and charges the per-user map limit. */
function searchArea(body: Record<string, unknown>, luid: string, chargeLimit = true): SearchArea {
  const lat=body.latitude,lng=body.longitude,requested=body.radiusMeters;
  if(typeof lat!=='number'||!Number.isFinite(lat)||Math.abs(lat)>90||typeof lng!=='number'||!Number.isFinite(lng)||Math.abs(lng)>180||typeof requested!=='number'||!Number.isFinite(requested)||requested<1||requested>20_000_000){ throw new HttpsError('invalid-argument','Invalid search area'); }
  if(chargeLimit&&MEMORY_LIMITS_ENABLED&&!nearbyLimiter.allow(luid)){ throw reasonError('resource-exhausted','Too many map requests; try again shortly','rate_limited'); }
  return { lat, lng, radius: Math.min(requested, MAX_NEARBY_RADIUS_M) };
}

async function nearbyDocuments(body: Record<string, unknown>, luid: string, blocked: BlockSets, chargeLimit = true) {
  return scanNearby(searchArea(body, luid, chargeLimit), luid, blocked);
}

/** Bounded range scan over posts: areas the map index does not serve, and the fallback until it is complete. */
async function scanNearby({ lat, lng, radius }: SearchArea, luid: string, blocked: BlockSets) {
const started=Date.now();
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
  const matches:FirebaseFirestore.QueryDocumentSnapshot[]=[];
  const found=[...candidates.values()];
  await forEachSequential(chunks(found, 100), async batch => {
   matches.push(...await visiblePosts(batch, blocked, luid));
  });
  // Distance selects the nearby set; popularity orders notes at a place in the native panel.
  matches.sort((a,b)=>distanceMeters(lat,lng,a.get('lat'),a.get('lng'))-distanceMeters(lat,lng,b.get('lat'),b.get('lng'))||Number(b.get('likes_count')??0)-Number(a.get('likes_count')??0)||a.id.localeCompare(b.id));
  info('nearby_query',{strategy:prefixes.length?'geohash':'latitude',scanned,matches:matches.length,elapsedMs:Date.now()-started,complete:true});
  return { matches, lat, lng, radius };
}

/**
 * Map-surface author fence: profile present, not deleted or suspended, no deletion job. Cached for a
 * minute per instance so a busy map does not re-read the same authors on every pan; rows that return a
 * body are re-checked uncached (visiblePosts).
 */
const AUTHOR_CACHE_MS = process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : 60_000;
const authorCache = new Map<string, { visible: boolean; until: number }>();
async function cachedVisibleAuthors(ids: string[], now = Date.now()) {
  const unique = [...new Set(ids)];
  const stale = unique.filter(id => !((authorCache.get(id)?.until ?? 0) > now));
  if (stale.length) {
    if (authorCache.size > 10_000) authorCache.clear();
    const fresh = new Set<string>();
    await forEachSequential(chunks(stale, 100), async batch => { for (const id of await visibleAuthors(batch, new Set())) fresh.add(id); });
    for (const id of stale) authorCache.set(id, { visible: fresh.has(id), until: now + AUTHOR_CACHE_MS });
  }
  return new Set(unique.filter(id => authorCache.get(id)?.visible));
}

/**
 * Public posts in the circle from the map cell index (mapCells.ts), after account fences and the block
 * rule for each post's kind. Null when the index is not complete yet, the area is too large or a cell
 * overflowed; the caller then scans posts.
 */
async function indexedNearby({ lat, lng, radius }: SearchArea, luid: string, blocked: BlockSets) {
  if (!(await mapCellsEnabled())) return null;
  const found = await mapCellCandidates(lat, lng, radius);
  if (!found || found.overflow.length) return null;
  const authors = await cachedVisibleAuthors(found.candidates.map(c => c.creatorId));
  const visible = found.candidates.filter(c => authors.has(c.creatorId) && !postHiddenByBlocks(luid, c.creatorId, c.anonymous, blocked));
  info('nearby_query', { strategy: 'map_cells', candidates: found.candidates.length, matches: visible.length });
  return visible;
}

/** The viewer's own posts that are not public and active (in review, flagged, friends-only, private). */
async function ownUnlistedNearby({ lat, lng, radius }: SearchArea, luid: string) {
  const posts = db.collection('posts').where('creator_id', '==', luid);
  const [review, unlisted] = await Promise.all([
    posts.where('status', 'in', ['pending_review', 'flagged']).orderBy('created_at', 'desc').limit(500).get(),
    posts.where('status', '==', 'active').where('visibility', 'in', ['friends', 'private']).orderBy('created_at', 'desc').limit(500).get()]);
  return [...review.docs, ...unlisted.docs].filter(doc => nearbyCandidate(doc, luid, lat, lng, radius));
}

const byDistanceThenLikes = (lat: number, lng: number) => (a: FirebaseFirestore.DocumentSnapshot, b: FirebaseFirestore.DocumentSnapshot) =>
  distanceMeters(lat, lng, a.get('lat'), a.get('lng')) - distanceMeters(lat, lng, b.get('lat'), b.get('lng'))
  || Number(b.get('likes_count') ?? 0) - Number(a.get('likes_count') ?? 0) || a.id.localeCompare(b.id);

const NEARBY_PAGE = 100;

/**
 * The nearest 100 posts. With the index only those rows (and posts tied with the 100th on distance,
 * which popularity then orders) are read, then re-checked live before their bodies are returned.
 */
async function nearbyPage(area: SearchArea, luid: string, blocked: BlockSets) {
  const indexed = await indexedNearby(area, luid, blocked);
  if (!indexed) {
    const { matches } = await scanNearby(area, luid, blocked);
    return { page: matches.slice(0, NEARBY_PAGE), total: matches.length };
  }
  const own = await ownUnlistedNearby(area, luid);
  const ownIds = new Set(own.map(doc => doc.id));
  type Ranked = { id: string; distance: number; doc?: FirebaseFirestore.QueryDocumentSnapshot };
  const ranked: Ranked[] = [...indexed.filter(c => !ownIds.has(c.id)).map(c => ({ id: c.id, distance: distanceMeters(area.lat, area.lng, c.lat, c.lng) })),
    ...own.map(doc => ({ id: doc.id, distance: distanceMeters(area.lat, area.lng, doc.get('lat'), doc.get('lng')), doc }))]
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const cutoff = ranked[NEARBY_PAGE - 1]?.distance ?? Infinity;
  const chosen = ranked.filter((entry, index) => index < NEARBY_PAGE || entry.distance === cutoff);
  const fetched: FirebaseFirestore.DocumentSnapshot[] = [];
  await forEachSequential(chunks(chosen.filter(entry => !entry.doc), 100), async batch => {
    fetched.push(...await db.getAll(...batch.map(entry => db.collection('posts').doc(entry.id))));
  });
  const live = [...fetched.filter(doc => doc.exists && isPublicActive(doc.data()) && validCoordinates(doc.get('lat'), doc.get('lng'))
    && distanceMeters(area.lat, area.lng, doc.get('lat'), doc.get('lng')) <= area.radius),
    ...chosen.flatMap(entry => entry.doc ? [entry.doc] : [])];
  const page = (await visiblePosts(live, blocked, luid)).sort(byDistanceThenLikes(area.lat, area.lng)).slice(0, NEARBY_PAGE);
  return { page, total: ranked.length };
}

async function readNearbyPosts(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const area = searchArea(body, luid);
  const { page, total } = await nearbyPage(area, luid, blocked);
  const offers = await ownCampaignOffers(luid, area.lat, area.lng, area.radius);
  return { posts: [...await rows(page, luid), ...offers.map(campaignRow)], next: null, total: total + offers.length };
}

async function readMapGroups(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const area = searchArea({ ...body, radiusMeters: Math.min(Number(body.radiusMeters), MAP_CELL_MAX_RADIUS_M) }, luid);
  // The index answers from a few cell documents; the scan fallback reads every post in range.
  const indexed = await indexedNearby(area, luid, blocked);
  const points = indexed ? indexed.map(c => ({ id: c.id, lat: c.lat, lng: c.lng, spotId: c.spotId ?? undefined }))
    : (await scanNearby(area, luid, blocked)).matches.filter(d => isPublicActive(d.data())).map(d => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), spotId: d.get('spot_id') }));
  const groups = mapNoteGroups(points);
  const { unlockRadius } = await spotSettings();
  // No caption, media, author or likes are returned by the map-summary surface.
  return { groups, unlockRadius };
}

const MAP_GROUP_ID = /^(spot|post):([0-9a-f-]{36})$/;
const POST_ID = /^[0-9a-f-]{36}$/;

/** Resolve a stale small-group identity through its current anchor membership. */
async function visibleMapDocuments(docs: FirebaseFirestore.DocumentSnapshot[], luid: string, blocked: BlockSets) {
  const allowed: FirebaseFirestore.DocumentSnapshot[] = [];
  await forEachSequential(chunks(docs.filter(d => d.exists && isPublicActive(d.data())
    && validCoordinates(d.get('lat'), d.get('lng'))), 100), async batch => {
    allowed.push(...await visiblePosts(batch, blocked, luid));
  });
  return allowed;
}

async function visibleMapAnchor(id: string, hints: string[], luid: string, blocked: BlockSets) {
  const anchor = await db.collection('posts').doc(id).get();
  if ((await visibleMapDocuments([anchor], luid, blocked)).length) return anchor;
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
  let found: FirebaseFirestore.DocumentSnapshot[] = [];
  if (group[1] === 'post') {
    const anchor = await visibleMapAnchor(group[2], hints, luid, blocked);
    if (!anchor) return { canonicalId, allowed: [] };
    canonicalId = `post:${anchor.id}`;
    const spot = anchor.get('spot_id');
    if (typeof spot === 'string' && POST_ID.test(spot)) canonicalId = `spot:${spot}`;
    else {
      // Membership is server-derived. A side-panel singleton or an outdated client member
      // list cannot silently omit the other notes belonging to this real place.
      const { matches } = await nearbyDocuments({ latitude: anchor.get('lat'), longitude: anchor.get('lng'),
        radiusMeters: SPOT_JOIN_RADIUS_M }, luid, blocked, false);
      const assigned = matches.find(d => d.id === anchor.id)?.get('spot_id');
      if (typeof assigned === 'string' && POST_ID.test(assigned)) canonicalId = `spot:${assigned}`;
      else found = matches.filter(d => !d.get('spot_id'));
    }
  }
  if (canonicalId.startsWith('spot:')) {
    const snapshot = await db.collection('posts').where('spot_id', '==', canonicalId.slice(5)).limit(MAX_NEARBY_SCAN + 1).get();
    if (snapshot.size > MAX_NEARBY_SCAN) throw new HttpsError('resource-exhausted', 'Map group is too large');
    found = snapshot.docs;
  }
  const allowed = await visibleMapDocuments(found, luid, blocked);
  return { canonicalId, allowed };
}

function mapGroupPageInput(body: Record<string, unknown>) {
  const requestedId = body.groupId;
  const offset = body.offset ?? 0, token = body.pageToken, hints = body.postIds ?? [];
  if (typeof requestedId !== 'string' || !MAP_GROUP_ID.test(requestedId)
    || !Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > MAX_NEARBY_SCAN
    || (token != null && (typeof token !== 'string' || !POST_ID.test(token))) || (Number(offset) > 0 && !token)
    || !Array.isArray(hints) || hints.length > MAX_NEARBY_SCAN || hints.some(id => typeof id !== 'string' || !POST_ID.test(id))) {
    throw new HttpsError('invalid-argument', 'Invalid map group page');
  }
  return { requestedId, offset: Number(offset), token: typeof token === 'string' ? token : undefined, hints };
}

async function mapGroupSession(luid: string, requestedId: string, token: string | undefined) {
  if (!token) return undefined;
  const session = await db.collection('map_group_sessions').doc(token).get();
  if (!session.exists || session.get('owner_luid') !== luid
    || ![session.get('requested_group_id'), session.get('group_id')].includes(requestedId)
    || !(session.get('expires_at') instanceof Timestamp) || session.get('expires_at').toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Map group page expired; refresh the group');
  }
  return session;
}

async function readMapGroup(body: Record<string, unknown>, luid: string, blocked: BlockSets) {
  const { requestedId, offset, token, hints } = mapGroupPageInput(body);
  if (MEMORY_LIMITS_ENABLED && !nearbyLimiter.allow(luid)) throw reasonError('resource-exhausted', 'Too many map requests; try again shortly', 'rate_limited');
  const session = await mapGroupSession(luid, requestedId, token);
  const { canonicalId, allowed } = await mapGroupDocuments(session?.get('group_id') ?? requestedId,
    session?.get('post_ids') ?? [...new Set(hints)], luid, blocked);
  if (session && session.get('group_id') !== canonicalId) await session.ref.update({ group_id: canonicalId });
  allowed.sort((a, b) => Number(b.get('likes_count') ?? 0) - Number(a.get('likes_count') ?? 0)
    || (b.get('created_at')?.toMillis?.() ?? 0) - (a.get('created_at')?.toMillis?.() ?? 0) || a.id.localeCompare(b.id, 'en'));
  const group = allowed.length ? mapGroupSummary(canonicalId, allowed.map(d => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng') }))) : null;
  const area = group ? { ...group, id: canonicalId.slice(5), groupId: canonicalId } : undefined;
  // Freeze the ordered IDs, never text or an access grant. Later pages recheck current
  // membership, blocks, account fences and fresh on-site location before serializing bodies.
  const order: string[] = session ? session.get('post_ids') : allowed.map(d => d.id);
  const byId = new Map(allowed.map(d => [d.id, d]));
  const start = Number(offset), end = start + 50;
  const page = order.slice(start, end).flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const posts = await rows(page, luid, body.location as Fix | undefined, area);
  const nextOffset = end < order.length ? end : null;
  let pageToken: string | null = typeof token === 'string' ? token : null;
  if (nextOffset != null && !pageToken) {
    pageToken = randomUUID();
    await db.collection('map_group_sessions').doc(pageToken).set({ owner_luid: luid,
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
  return { posts, nextOffset, pageToken, total: order.filter(id => byId.has(id)).length, group };
}

async function readFeed(body: Record<string, unknown>, luid: string, blocked: BlockSets, mode: string) {
if(!['discover','creator'].includes(mode)){ throw new HttpsError('invalid-argument','Invalid content mode'); }const creator=mode==='creator'?scalarText(body.creatorId??''):null;
 if(creator&&!(await visibleAuthors([creator],blocked.identity)).has(creator)){ return{posts:[],next:null}; }const scope=fingerprint([luid,mode,creator]),continuation=decode(body.cursor,scope);
 let query=db.collection('posts').where('status','==','active').where('visibility','==','public');if(creator){ query=query.where('creator_id','==',creator); }
 let ordered=query.orderBy('created_at','desc').orderBy('__name__','desc');if(continuation){ ordered=ordered.startAfter(continuation.date,continuation.id); }
 const page=await ordered.limit(51).get(),documents=page.docs.slice(0,50),allowed=new Set((await visiblePosts(documents,blocked,luid)).map(d=>d.id));
 // The cursor is taken from the chronological page; only the first discover page is re-ordered.
 const next=page.size>50?cursor(documents.at(-1)!,scope):null;
 const visible=documents.filter(d=>isPublicActive(d.data())&&allowed.has(d.id)&&(!creator||creator===luid||d.get('is_anonymous')!==true));
 const ordering=mode==='discover'&&!continuation?rankForDiscover(visible,d=>({engagement:d.get('engagement_score'),createdAtMs:d.get('created_at') instanceof Timestamp?d.get('created_at').toMillis():null}),Date.now()):visible;
 return{posts:await rows(ordering,luid),next};
}

function nearbyCandidate(doc: FirebaseFirestore.QueryDocumentSnapshot, luid: string, lat: number, lng: number, radius: number): boolean {
 const ownerVisible = doc.get('creator_id') === luid && ['active', 'pending_review', 'flagged'].includes(doc.get('status'))
  && !doc.get('deleted_at') && doc.get('age_rating') !== '18_plus';
 return (isPublicActive(doc.data()) || ownerVisible)
  && distanceMeters(lat, lng, Number(doc.get('lat')), Number(doc.get('lng'))) <= radius;
}
