import 'server-only';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebase-admin';
import { luidForUid } from './account-lifecycle';
import { permissionsFor } from './rbac';
import { anyBlocked, handleIsBlocked, isReservedHandle } from './content-moderation';
import { distanceMeters, encodeGeohash } from './geo';
import { requiredString, uuid, ValidationError } from './validation';
import { checkReceipt, ConflictError, derivedKey, mutationHash, requireActorAccountActive, requireTargetAccountActive, writeAudit } from './ops';

import type { ContentInput } from './content-models';
export type { ContentInput } from './content-models';
const HOSTS: Record<string, string[]> = {
  spotify: ['open.spotify.com', 'spotify.link'], youtube: ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'],
  instagram: ['instagram.com','www.instagram.com'], x: ['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'],
  facebook: ['facebook.com','www.facebook.com','m.facebook.com','fb.watch'],
};
function number(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${field} must be ${min}–${max}`);
  return value;
}
export function parseContentInput(body: Record<string, unknown>): ContentInput {
  const caption = requiredString(body.caption, 'caption', 1, 220);
  const text = typeof body.text === 'string' ? body.text.trim() : caption;
  if (text.length > 2000 || anyBlocked([caption, text])) throw new ValidationError('content_not_allowed');
  const platform = String(body.platform ?? 'text'); const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (platform !== 'text') {
    let parsed: URL; try { parsed = new URL(url); } catch { throw new ValidationError('invalid_social_link'); }
    if (!HOSTS[platform]?.includes(parsed.hostname.toLowerCase()) || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || url.length > 2048) throw new ValidationError('invalid_social_link');
  } else if (url) throw new ValidationError('select_social_platform');
  if (!['all','13_plus','16_plus'].includes(String(body.ageRating ?? 'all'))) throw new ValidationError('18+ content is disabled');
  if (!['public','friends','private'].includes(String(body.visibility ?? 'public'))) throw new ValidationError('invalid_visibility');
  if (!['active','pending_review'].includes(String(body.status ?? 'pending_review'))) throw new ValidationError('invalid_status');
  const color = String(body.color ?? '#FFFFFF'), background = String(body.background ?? '#111827');
  if (![color,background].every(c => /^#[0-9A-Fa-f]{6}$/.test(c))) throw new ValidationError('invalid_color');
  const zoneExceptionReason = typeof body.zoneExceptionReason === 'string' ? body.zoneExceptionReason.trim() : '';
  if (zoneExceptionReason && (zoneExceptionReason.length < 8 || zoneExceptionReason.length > 1000)) throw new ValidationError('zone exception requires 8–1000 characters');
  return {
    authorId: uuid(body.authorId,'authorId').toLowerCase(), caption, text, platform, url,
    lat: number(body.lat,'latitude',-90,90), lng: number(body.lng,'longitude',-180,180),
    altitude: number(body.altitude ?? 0,'altitude',-500,10000), heading: number(body.heading ?? 0,'heading',0,360),
    width: number(body.width ?? 0.45,'width',0.15,20), height: number(body.height ?? 0.51,'height',0.15,20),
    opacity: number(body.opacity ?? 1,'opacity',0.05,1), scale: number(body.scale ?? 1,'scale',0.1,5), rotation: number(body.rotation ?? 0,'rotation',-360,360),
    color, background, visibility: (body.visibility ?? 'public') as ContentInput['visibility'], ageRating: (body.ageRating ?? 'all') as ContentInput['ageRating'],
    status: (body.status ?? 'pending_review') as ContentInput['status'], zoneExceptionReason, replacePlacement: body.replacePlacement === true,
  };
}
async function requirePermission(tx: Transaction, actorId: string, permission: string) {
  await requireActorAccountActive(tx, actorId);
  const roles = await tx.get(adminDb().collection('admin_role_assignments').where('user_id','==',actorId).where('revoked_at','==',null));
  if (!permissionsFor(roles.docs.map(d => String(d.get('role_key')))).has(permission)) throw new ConflictError('permission_revoked');
}
async function activeAuthor(tx: Transaction, id: string) {
  await requireTargetAccountActive(tx,id);
  const snap = await tx.get(adminDb().collection('profiles').doc(id));
  if (!snap.exists || snap.get('deleted_at') || snap.get('suspended')) throw new ConflictError('author_unavailable');
  return snap;
}
function placement(input: ContentInput, postId: string) {
  const capturedAt = new Date().toISOString(); const yaw = input.heading * Math.PI / 180;
  const transform = [Math.cos(yaw),0,-Math.sin(yaw),0, 0,1,0,0, Math.sin(yaw),0,Math.cos(yaw),0, 0,0,-1.5,1];
  const geoPose = { latitude: input.lat, longitude: input.lng, altitude: input.altitude, heading: input.heading, accuracy: null };
  const rect = { width: input.width, height: input.height };
  const anchor = { id: derivedKey(postId,'anchor'), transform, pinQuality: 'freeSpaceApproximate', hitSource: 'frontOfCamera', surfaceAlignment: 'free_space',
    trackingQuality: 'unknown', worldMappingStatus: 'notAvailable', geoPose, physicalRectMeters: rect, capturedAt };
  return {
    pose_json: JSON.stringify({ ...geoPose, anchor: { coordinateSpace: 'admin_geo_estimate', provider: 'admin', x: 0,y:0,z:-1.5,yaw,pitch:0,roll:0,
      nativeAnchorId: anchor.id, capturedAt, trackingQuality:'unknown',surfaceAlignment:'free_space',physicalRectMeters:rect } }),
    anchor_bundle_json: JSON.stringify({ schemaVersion:2, provider:'admin', coordinateSpace:'admin_geo_estimate', anchor }),
    placement_state:'free_space_approximate', placement_quality:0, native_provider:'admin', multi_user_ready:false,
    resolver_strategy:['aim_guided_reveal'], cloud_anchor_id:null, geospatial:false, world_map_path:null,
    calibration_json: JSON.stringify({ state:'admin_geo_estimate', physicalRectMeters:rect }),
  };
}
export async function saveAdminPost(input: ContentInput, actorId: string, reason: string, key: string, editingId?: string) {
  const db = adminDb(); const id = editingId ?? derivedKey(key,'post');
  const action = editingId ? 'admin_post_edit' : 'admin_post_create';
  const hash = mutationHash(actorId,action,id,{input,reason});
  return db.runTransaction(async tx => {
    await requirePermission(tx,actorId,editingId ? 'posts.edit' : 'posts.create');
    if (input.status === 'active') await requirePermission(tx,actorId,'posts.moderate');
    const [audit, before] = await tx.getAll(db.collection('admin_audit_log').doc(key),db.collection('posts').doc(id));
    if (checkReceipt(audit,hash)) return { id };
    if (editingId && !before.exists) throw new ValidationError('post_not_found');
    if (before.get('deleted_at')) throw new ConflictError('restore_post_before_editing');
    const author = await activeAuthor(tx,input.authorId);
    if (before.exists && before.get('creator_id') !== input.authorId) throw new ConflictError('post_author_cannot_be_changed');
    const zones = await tx.get(db.collection('protected_zones').where('active','==',true));
    const blockedZones = zones.docs.filter(z => z.get('policy') === 'hard_block' && distanceMeters(input.lat,input.lng,Number(z.get('lat')),Number(z.get('lng'))) <= Number(z.get('radius_meters')));
    if (blockedZones.length) {
      if (!input.zoneExceptionReason) throw new ConflictError('protected_zone: a reasoned admin exception is required');
      await requirePermission(tx,actorId,'zones.override');
    }
    const oldPose = before.exists ? JSON.parse(String(before.get('pose_json') || '{}')) : {};
    const oldRect = oldPose.anchor?.physicalRectMeters;
    const moved = before.exists && (before.get('lat') !== input.lat || before.get('lng') !== input.lng || oldPose.heading !== input.heading
      || (oldPose.altitude ?? 0) !== input.altitude || oldRect?.width !== input.width || oldRect?.height !== input.height);
    const oldCloudId = before.get('cloud_anchor_id');
    const anchor = moved && typeof oldCloudId === 'string' ? await tx.get(db.collection('cloud_anchors').doc(oldCloudId)) : null;
    const physical = before.exists && oldPose.anchor?.coordinateSpace !== 'admin_geo_estimate' && oldPose.anchor?.coordinateSpace !== 'camera_free_space';
    if (moved && physical && !input.replacePlacement) throw new ConflictError('confirm_approximate_replacement');
    const editData = { version:1, canvas:{width:1080,height:1920}, backgroundColor:input.background,
      layers:[{id:derivedKey(id,'text'),type:'text',text:input.text,color:input.color,opacity:input.opacity,scale:input.scale,rotation:input.rotation,x:0,y:0,zIndex:0,fontSize:32}] };
    const contentSource = input.platform === 'text' ? {platform:'other',title:input.text} : {platform:input.platform,url:input.url,mediaKind:'embed',title:input.caption};
    const changed = {
      caption:input.caption,edit_data_json:JSON.stringify(editData),content_source_json:JSON.stringify(contentSource),
      lat:input.lat,lng:input.lng,geohash:encodeGeohash(input.lat,input.lng,10),visibility:input.visibility,age_rating:input.ageRating,status:input.status,
      ...(!before.exists || moved ? placement(input,id) : {}),
      protected_zone_name:blockedZones.length ? blockedZones.map(z => String(z.get('name'))).join(', ') : null,
      admin_zone_exception:blockedZones.length ? {reason:input.zoneExceptionReason,actor_id:actorId,zone_ids:blockedZones.map(z=>z.id)} : null,
      updated_at:FieldValue.serverTimestamp(),updated_by_admin:actorId,
    };
    if (anchor?.exists && anchor.get('post_id') === id) {
      tx.update(anchor.ref,{state:'deleting',expires_at:FieldValue.delete()});
      tx.set(db.collection('cloud_anchor_deletions').doc(anchor.id),{next_at:Timestamp.now(),attempts:0,created_at:FieldValue.serverTimestamp()});
    }
    if (before.exists) tx.update(before.ref,changed);
    else tx.create(before.ref,{...changed,id,creator_id:input.authorId,creator_handle:String(author.get('handle')),ref_image_url:'native-ar-reference://none',
      views_count:0,likes_count:0,comments_count:0,saves_count:0,engagement_score:0,client_mutation_id:id,deleted_at:null,created_at:FieldValue.serverTimestamp(),created_by_admin:actorId});
    tx.set(db.collection('storage_reclamations').doc(id),{state:'committed',creator_id:input.authorId,post_id:id,world_map_path:before.exists&&!moved?before.get('world_map_path')??null:null,public_readable:input.status==='active'&&input.visibility==='public'});
    writeAudit(tx,key,{requestHash:hash,actorId,action,resourceType:'post',resourceId:id,before:before.data(),after:{...changed,creator_id:input.authorId},reason,
      permissionKey:editingId ? 'posts.edit':'posts.create',riskLevel:'sensitive'});
    return { id };
  });
}
export async function saveAdminComment(postId: string, authorId: string, text: string, actorId: string, reason: string, key: string, editingId?: string) {
  text = requiredString(text,'text',1,500);
  if (anyBlocked([text])) throw new ValidationError('content_not_allowed');
  const db=adminDb(), id=editingId ?? derivedKey(key,'comment');
  const hash=mutationHash(actorId,editingId?'comment_edit':'comment_create',id,{postId,authorId,text,reason});
  return db.runTransaction(async tx=>{
    await requirePermission(tx,actorId,'comments.write');
    const [audit,post,comment] = await tx.getAll(db.collection('admin_audit_log').doc(key),db.collection('posts').doc(postId),db.collection('comments').doc(id));
    if(checkReceipt(audit,hash)) return {id};
    if(!post.exists||post.get('deleted_at')||post.get('age_rating')==='18_plus'||post.get('status')!=='active') throw new ConflictError('post_unavailable');
    const author=await activeAuthor(tx,authorId);
    await activeAuthor(tx,post.get('creator_id'));
    const [blockA,blockB]=await tx.getAll(db.collection('user_blocks').doc(`${authorId}_${post.get('creator_id')}`),db.collection('user_blocks').doc(`${post.get('creator_id')}_${authorId}`));
    if(blockA.exists||blockB.exists) throw new ConflictError('users_blocked');
    if(editingId && (!comment.exists||comment.get('post_id')!==postId||comment.get('user_id')!==authorId)) throw new ConflictError('comment_target_changed');
    const data={post_id:postId,user_id:authorId,text,username:String(author.get('handle')),admin_restored:true,updated_by_admin:actorId,updated_at:FieldValue.serverTimestamp()};
    if(editingId) tx.update(comment.ref,data); else tx.create(comment.ref,{...data,id,created_at:FieldValue.serverTimestamp(),created_by_admin:actorId});
    writeAudit(tx,key,{requestHash:hash,actorId,action:editingId?'comment_edit':'comment_create',resourceType:'comment',resourceId:id,before:comment.data(),after:data,reason,permissionKey:'comments.write',riskLevel:'sensitive'});
    return {id};
  });
}
export async function removeAdminComment(postId:string,commentId:string,actorId:string,reason:string,key:string){
  const db=adminDb(),hash=mutationHash(actorId,'comment_delete',commentId,{postId,reason});
  return db.runTransaction(async tx=>{
    await requirePermission(tx,actorId,'comments.write');
    const [audit,comment]=await tx.getAll(db.collection('admin_audit_log').doc(key),db.collection('comments').doc(commentId));
    if(checkReceipt(audit,hash))return {id:commentId};
    if(!comment.exists||comment.get('post_id')!==postId)throw new ConflictError('comment_not_found');
    tx.delete(comment.ref);
    writeAudit(tx,key,{requestHash:hash,actorId,action:'comment_delete',resourceType:'comment',resourceId:commentId,before:comment.data(),reason,permissionKey:'comments.write',riskLevel:'sensitive'});
    return {id:commentId};
  });
}

/** Create a disabled Auth identity, not a verified login or an admin role. Two external systems
 * use a durable reservation; retries reconcile the same UID and finish one profile/audit. */
export async function createManagedUser(input:{handle:string;displayName:string;email:string},actorId:string,reason:string,key:string){
  const handle=requiredString(input.handle,'handle',3,30).toLowerCase();
  if(!/^[a-z0-9_.]{3,30}$/.test(handle)||isReservedHandle(handle)||handleIsBlocked(handle))throw new ValidationError('invalid_handle');
  const displayName=requiredString(input.displayName,'displayName',1,60);
  if(anyBlocked([displayName]))throw new ValidationError('display_name_not_allowed');
  const email=input.email.trim().toLowerCase();
  if(email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))throw new ValidationError('invalid_email');
  const db=adminDb(),uid='admin-managed-'+derivedKey(key,'identity'),luid=luidForUid(uid);
  const hash=mutationHash(actorId,'managed_user_create',luid,{handle,displayName,email,reason});
  const job=db.collection('admin_user_creations').doc(key);
  await db.runTransaction(async tx=>{
    await requirePermission(tx,actorId,'users.create');
    const [existing,reservation,deletion]=await tx.getAll(job,db.collection('handles').doc(handle),db.collection('account_deletion_jobs').doc(luid));
    if(deletion.exists)throw new ConflictError('account_deleting');
    if(checkReceipt(existing,hash))return;
    if(reservation.exists&&reservation.get('luid')!==luid)throw new ConflictError('handle_taken');
    tx.create(job,{request_hash:hash,uid,luid,handle,status:'reserved',actor_id:actorId,created_at:FieldValue.serverTimestamp()});
    tx.set(reservation.ref,{luid,creation_job:key,created_at:FieldValue.serverTimestamp()});
  });
  const completed = await db.collection('admin_audit_log').doc(key).get();
  if (checkReceipt(completed, hash)) return {id:luid,handle};
  let user;
  try{user=await adminAuth().getUser(uid);}catch(error){
    if((error as {code?:string}).code!=='auth/user-not-found')throw error;
    try{user=await adminAuth().createUser({uid,...(email?{email}:{}),displayName,disabled:true,emailVerified:false});}
    catch(createError){if((createError as {code?:string}).code==='auth/uid-already-exists')user=await adminAuth().getUser(uid);else {
      // Definite Auth validation/collision failures created no identity. Release only this
      // job's handle reservation; ambiguous network failures keep it for safe reconciliation.
      if (['auth/email-already-exists','auth/invalid-email','auth/invalid-display-name'].includes((createError as {code?:string}).code ?? '')) {
        await db.runTransaction(async tx => {
          const [pending, reservation] = await tx.getAll(job, db.collection('handles').doc(handle));
          if (pending.get('status') === 'reserved' && reservation.get('creation_job') === key) { tx.delete(reservation.ref); tx.delete(job); }
        });
      }
      throw createError;
    }}
  }
  if(!user.disabled || user.emailVerified)throw new ConflictError('managed_identity_changed');
  await adminAuth().setCustomUserClaims(uid,{...(user.customClaims??{}),luid});
  await db.runTransaction(async tx=>{
    await requirePermission(tx,actorId,'users.create');
    const [audit,profile,deletion,reservation]=await tx.getAll(db.collection('admin_audit_log').doc(key),db.collection('profiles').doc(luid),db.collection('account_deletion_jobs').doc(luid),db.collection('handles').doc(handle));
    if(checkReceipt(audit,hash))return;
    if(deletion.exists||reservation.get('luid')!==luid)throw new ConflictError('identity_reservation_changed');
    if(profile.exists)throw new ConflictError('profile_already_exists');
    const data={id:luid,handle,display_name:displayName,avatar_url:null,avatar_preset:null,bio:null,follower_count:0,following_count:0,public_post_count:0,
      suspended:false,deleted_at:null,admin_managed:true,created_by_admin:actorId,created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()};
    tx.create(profile.ref,data);tx.set(db.collection('account_access').doc(luid),{state:'active'});
    tx.set(db.collection('users_private').doc(luid),{uid,email:email||null,auth_provider:'admin_managed',identity_verified:false});
    tx.update(job,{status:'completed'});
    writeAudit(tx,key,{requestHash:hash,actorId,action:'managed_user_create',resourceType:'user',resourceId:luid,after:{handle,admin_managed:true},reason,permissionKey:'users.create',riskLevel:'critical'});
  });
  return {id:luid,handle};
}
