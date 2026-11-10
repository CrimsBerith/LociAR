import { randomUUID, createHash } from 'node:crypto';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminBucket, adminDb } from '../../../../../../../lib/firebase-admin';
import { requireAdminApi } from '../../../../../../../lib/admin';
import { ConflictError, derivedKey, requireActorAccountActive, writeAudit } from '../../../../../../../lib/ops';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../../lib/api';
import { idempotencyKey, requiredString, uuid, ValidationError } from '../../../../../../../lib/validation';
import { permissionsFor } from '../../../../../../../lib/rbac';
import { judgeSafeSearch, safeSearchSummary } from '../../../../../../../lib/avatar-policy';

export const runtime = 'nodejs';
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
let vision: ImageAnnotatorClient | null = null;

async function requireManagedProfilePermission(tx:Transaction,actorId:string) {
  await requireActorAccountActive(tx,actorId);
  const roles=await tx.get(adminDb().collection('admin_role_assignments').where('user_id','==',actorId).where('revoked_at','==',null));
  if(!permissionsFor(roles.docs.map(doc=>String(doc.get('role_key')))).has('users.managed_profiles.write'))throw new ConflictError('permission_revoked');
}

function queueAvatarDelete(tx:Transaction,luid:string,path:string) {
  const match=/^avatars\/([0-9a-f-]{36})\/(current|pending)\/([0-9a-f-]{36})\.jpg$/.exec(path);
  if(!match||match[1]!==luid)throw new Error('invalid_avatar_deletion_path');
  tx.set(adminDb().collection('avatar_deletions').doc(`${match[3]}_${match[2]}`),{luid,path,next_at:Timestamp.now(),attempts:0});
}

export async function POST(request:Request,context:{params:Promise<{luid:string}>}) {
  const originError=requireSameOrigin(request);if(originError)return originError;
  const access=await requireAdminApi('users.managed_profiles.write');if(!access.ok)return unauthorized(access);
  try {
    const {luid:rawLuid}=await context.params,luid=uuid(rawLuid,'luid').toLowerCase();
    const length=Number(request.headers.get('content-length')??0);
    if(length>MAX_AVATAR_BYTES+64_000)throw new ValidationError('Avatar file must be 3 MB or smaller');
    const form=await request.formData(),file=form.get('file');
    if(!(file instanceof File))throw new ValidationError('Choose a JPEG profile photo');
    if(file.type!=='image/jpeg'||file.size<4||file.size>MAX_AVATAR_BYTES)throw new ValidationError('Avatar must be a JPEG no larger than 3 MB');
    const reason=requiredString(form.get('reason'),'reason',8,1000),key=idempotencyKey(request);
    const bytes=Buffer.from(await file.arrayBuffer());
    if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)throw new ValidationError('Avatar file is not a valid JPEG');
    const digest=createHash('sha256').update(bytes).digest('hex');
    const rate=await enforceRateLimit(access.context.user.id,'managed-avatar-upload',10,60);if(rate)return rate;
    const targetRate=await enforceRateLimit(luid,'managed-avatar-target',5,3600);if(targetRate)return targetRate;
    const db=adminDb(),jobRef=db.collection('admin_managed_avatar_uploads').doc(key),objectId=randomUUID();
    const path=`avatars/${luid}/pending/${objectId}.jpg`,reviewRef=db.collection('avatar_reviews').doc(luid);
    const hash=createHash('sha256').update(JSON.stringify({actor:access.context.user.id,luid,digest,reason})).digest('hex');
    const initial=await db.runTransaction(async tx=>{
      await requireManagedProfilePermission(tx,access.context.user.id);
      const [job,profile,account,deletion,review]=await tx.getAll(jobRef,db.collection('profiles').doc(luid),db.collection('account_access').doc(luid),db.collection('account_deletion_jobs').doc(luid),reviewRef);
      if(job.exists){
        if(job.get('request_hash')!==hash)throw new ConflictError('idempotency_key_reused');
        const status=String(job.get('status'));
        if(['accepted','rejected','superseded'].includes(status))return{done:status,path:String(job.get('path'))};
        if(job.get('lease_until')?.toMillis?.()>Date.now())throw new ConflictError('avatar_upload_in_progress');
        if(!profile.exists||profile.get('deleted_at')||profile.get('admin_managed')!==true||deletion.exists||account.get('state')!=='active')throw new ConflictError('managed_profile_unavailable');
        tx.update(jobRef,{status:'screening',lease_until:Timestamp.fromMillis(Date.now()+120_000),updated_at:FieldValue.serverTimestamp()});
        return{done:null,path:String(job.get('path')),previousAvatar:job.get('previous_avatar')??null,previousPreset:job.get('previous_preset')??null};
      }
      if(!profile.exists||profile.get('deleted_at')||profile.get('admin_managed')!==true||deletion.exists||account.get('state')!=='active')throw new ConflictError('target_not_admin_managed_or_active');
      const flags=await tx.get(db.collection('system').doc('flags'));
      if(flags.get('kill_switch')===true)throw new ConflictError('avatar_upload_paused');
      const slotRef=db.collection('avatar_uploads').doc(objectId);
      tx.create(slotRef,{luid,uploaded_by_admin:access.context.user.id,created_at:FieldValue.serverTimestamp(),expires_at:Timestamp.fromMillis(Date.now()+3_600_000)});
      tx.set(reviewRef,{luid,latest_object:path},{merge:true});
      tx.create(jobRef,{request_hash:hash,actor_id:access.context.user.id,luid,object_id:objectId,path,status:'screening',lease_until:Timestamp.fromMillis(Date.now()+120_000),
        previous_avatar:profile.get('avatar_url')??null,previous_preset:profile.get('avatar_preset')??null,reason,image_sha256:digest,created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp(),
        expires_at:Timestamp.fromMillis(Date.now()+90*86_400_000)});
      return{done:null,path,previousAvatar:profile.get('avatar_url')??null,previousPreset:profile.get('avatar_preset')??null};
    });
    if(initial.done)return NextResponse.json({status:initial.done});
    const pending=adminBucket().file(initial.path),[exists]=await pending.exists();
    if(!exists)await pending.save(bytes,{resumable:false,metadata:{contentType:'image/jpeg',cacheControl:'private, no-store'}});
    let annotation;
    try{
      vision??=new ImageAnnotatorClient();
      const [result]=await vision.safeSearchDetection({image:{content:bytes}});
      annotation=result.safeSearchAnnotation;
    }catch{
      await jobRef.update({status:'retryable',lease_until:null,last_error_code:'vision_unavailable',updated_at:FieldValue.serverTimestamp()});
      return NextResponse.json({error:'Avatar screening is temporarily unavailable. Retry the same upload.'},{status:503});
    }
    const verdict=judgeSafeSearch(annotation);
    if(verdict==='rejected'){
      await db.runTransaction(async tx=>{
        await requireManagedProfilePermission(tx,access.context.user.id);
        const [job,slot,profile]=await tx.getAll(jobRef,db.collection('avatar_uploads').doc(initial.path.split('/').at(-1)!.replace('.jpg','')),db.collection('profiles').doc(luid));
        if(job.get('request_hash')!==hash)return;
        tx.update(jobRef,{status:'rejected',lease_until:null,safe_search:safeSearchSummary(annotation),updated_at:FieldValue.serverTimestamp()});
        if(slot.exists)tx.delete(slot.ref);
        if(profile.exists&&profile.get('admin_managed')===true)tx.set(db.collection('users_private').doc(luid),{avatar_rejected_at:FieldValue.serverTimestamp()},{merge:true});
        writeAudit(tx,derivedKey(key,'avatar-result'),{actorId:access.context.user.id,action:'managed_avatar_rejected',resourceType:'user',resourceId:luid,
          after:{status:'rejected',safe_search:safeSearchSummary(annotation)},reason,permissionKey:'users.managed_profiles.write',riskLevel:'sensitive'});
        queueAvatarDelete(tx,luid,initial.path);
      });
      return NextResponse.json({status:'rejected'});
    }
    const currentPath=`avatars/${luid}/current/${initial.path.split('/').at(-1)}`;
    await pending.copy(adminBucket().file(currentPath));
    await adminBucket().file(currentPath).setMetadata({metadata:{firebaseStorageDownloadTokens:null}});
    const published=await db.runTransaction(async tx=>{
      await requireManagedProfilePermission(tx,access.context.user.id);
      const [job,profile,review,slot,deletion]=await tx.getAll(jobRef,db.collection('profiles').doc(luid),reviewRef,
        db.collection('avatar_uploads').doc(initial.path.split('/').at(-1)!.replace('.jpg','')),db.collection('account_deletion_jobs').doc(luid));
      if(job.get('request_hash')!==hash)return false;
      if(!profile.exists||profile.get('deleted_at')||profile.get('admin_managed')!==true||deletion.exists||review.get('latest_object')!==initial.path
        ||(profile.get('avatar_url')??null)!==initial.previousAvatar||(profile.get('avatar_preset')??null)!==initial.previousPreset)return false;
      const old=profile.get('avatar_url');
      if(typeof old==='string'&&old.startsWith('storage://avatars/'))queueAvatarDelete(tx,luid,old.slice('storage://'.length));
      tx.update(profile.ref,{avatar_url:`storage://${currentPath}`,avatar_preset:null,updated_at:FieldValue.serverTimestamp()});
      tx.set(reviewRef,{luid,path:currentPath,status:'pending',safe_search:safeSearchSummary(annotation),uploaded_by_admin:access.context.user.id,created_at:FieldValue.serverTimestamp()},{merge:true});
      tx.set(db.collection('avatar_screenings').doc(initial.path.split('/').at(-1)!.replace('.jpg','')),{luid,status:'accepted',uploaded_by_admin:access.context.user.id,
        safe_search:safeSearchSummary(annotation),expires_at:Timestamp.fromMillis(Date.now()+90*86_400_000)},{merge:true});
      if(slot.exists)tx.delete(slot.ref);
      tx.update(jobRef,{status:'accepted',lease_until:null,current_path:currentPath,safe_search:safeSearchSummary(annotation),updated_at:FieldValue.serverTimestamp()});
      queueAvatarDelete(tx,luid,initial.path);
      writeAudit(tx,derivedKey(key,'avatar-result'),{actorId:access.context.user.id,action:'managed_avatar_uploaded',resourceType:'user',resourceId:luid,
        before:{avatar_set:!!initial.previousAvatar,avatar_preset:initial.previousPreset??null},after:{status:'accepted_pending_human_review',safe_search:safeSearchSummary(annotation)},
        reason,permissionKey:'users.managed_profiles.write',riskLevel:'sensitive'});
      return true;
    });
    if(!published){
      await db.runTransaction(async tx=>{
        const [job,slot]=await tx.getAll(jobRef,db.collection('avatar_uploads').doc(initial.path.split('/').at(-1)!.replace('.jpg','')));
        if(job.get('request_hash')===hash){tx.update(jobRef,{status:'superseded',lease_until:null,updated_at:FieldValue.serverTimestamp()});if(slot.exists)tx.delete(slot.ref);queueAvatarDelete(tx,luid,initial.path);queueAvatarDelete(tx,luid,currentPath);}
      });
      return NextResponse.json({status:'superseded'});
    }
    return NextResponse.json({status:'accepted_pending_human_review'});
  }catch(error){return apiError(error);}
}
