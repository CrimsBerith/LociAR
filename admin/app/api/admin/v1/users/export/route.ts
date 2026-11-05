import { DocumentReference, FieldPath, GeoPoint, Timestamp, type QueryDocumentSnapshot, type Query } from 'firebase-admin/firestore';
import type { UserRecord } from 'firebase-admin/auth';
import { adminAuth, adminBucket, adminDb } from '../../../../../../lib/firebase-admin';
import { requireAdminApi } from '../../../../../../lib/admin';
import { recordAudit } from '../../../../../../lib/ops';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { parseJson, requiredString, ValidationError } from '../../../../../../lib/validation';

export const runtime = 'nodejs';

const REQUIRED_PERMISSIONS = ['users.read','users.full_export','users.location.read','users.telemetry.read'] as const;
const STORAGE_FOLDERS = ['post-layer-assets','post-video-assets','post-world-maps','post-reference-images','post-surface-textures','avatars'] as const;
const PAGE_SIZE = 100;
const SECRET_FIELD = /password|token|secret|api[_-]?key|authorization|bearer|raw_code|otp|private[_-]?key/i;

// These owner relations mirror the account-deletion ownership map. Authentication factors,
// admin sessions/challenges, audit logs and raw push credentials are deliberately not exported.
const USER_RECORDS: ReadonlyArray<readonly [collection: string, key: string, field: string]> = [
  ['posts','posts_authored','creator_id'], ['comments','comments_authored','user_id'], ['likes','likes_created','user_id'],
  ['post_saves','post_saves_created','user_id'], ['filtered_comments','filtered_comments_authored','user_id'],
  ['follows','follows_started','follower_id'], ['follows','follows_received','following_id'],
  ['user_blocks','blocks_created','blocker_id'], ['user_blocks','blocked_by','blocked_id'],
  ['anonymous_blocks','anonymous_blocks_created','blocker_id'], ['anonymous_blocks','anonymous_blocks_by','blocked_id'],
  ['collections','collections_owned','owner_id'], ['collection_items','collection_items_owned','owner_id'],
  ['activity_events','activity_received','recipient_id'], ['activity_events','activity_created','actor_id'],
  ['post_view_receipts','post_view_receipts','user_id'], ['analytics_events','analytics_events','user_id'],
  ['campaign_targets','campaign_targets','owner_luid'], ['campaign_departure_regions','campaign_departure_regions','owner_luid'],
  ['campaign_view_receipts','campaign_view_receipts','owner_luid'], ['campaign_progress','campaign_progress','owner_luid'],
  ['campaign_codes','campaign_codes','owner_luid'], ['brand_memberships','brand_memberships','owner_luid'],
  ['brand_submission_quota','brand_submission_quota','owner_luid'], ['campaign_locations','campaign_locations_authored','author_luid'],
  ['note_spot_members','note_spot_members','owner_luid'], ['cloud_anchors','cloud_anchors','owner_luid'],
  ['brands','brands_authored','author_luid'], ['campaigns','campaigns_authored','author_luid'], ['campaigns','campaigns_submitted','submitted_by'],
  ['place_note_notification_receipts','place_note_notification_receipts','owner_luid'], ['dense_spot_unlocks','dense_spot_unlocks','owner_luid'],
  ['dense_spot_receipts','dense_spot_receipts','owner_luid'], ['map_group_sessions','map_group_sessions','owner_luid'],
  ['admin_notification_jobs','admin_notification_jobs','owner_luid'], ['admin_notification_receipts','admin_notification_receipts','owner_luid'],
  ['promotion_push_quota','promotion_push_quota','owner_luid'], ['post_quota','post_quota','owner_luid'],
  ['anchor_quota','anchor_quota','owner_luid'], ['arcore_token_quota','arcore_token_quota','owner_luid'],
  ['gif_search_quota','gif_search_quota','owner_luid'], ['report_quota','report_quota','owner_luid'],
  ['report_receipts','report_receipts_filed','owner_luid'], ['report_receipts','report_receipts_targeted','target_luid'],
  ['anonymous_block_quota','anonymous_block_quota','owner_luid'], ['push_tokens','push_registrations','owner_luid'],
  ['push_devices','push_devices','luid'], ['push_quota','push_quota','owner_luid'], ['push_delivery_receipts','push_delivery_receipts','owner_luid'],
  ['handles','handle_reservations','luid'], ['avatar_reviews','avatar_reviews','luid'], ['avatar_uploads','avatar_uploads','luid'],
  ['avatar_screenings','avatar_screenings','luid'], ['avatar_deletions','avatar_deletions','luid'],
  ['moderation_originals','moderation_originals','user_id'], ['storage_reclamations','storage_reclamations','creator_id'],
  ['storage_reclamation_queue','storage_reclamation_queue','creator_id'], ['invites','invites_created','creator_id'],
  ['invites','invites_redeemed','redeemed_by'], ['invite_attempts','invite_attempts','owner_luid'],
  ['support_balances','support_balances','owner_luid'], ['support_quota','support_quota','owner_luid'],
  ['support_checkout_locks','support_checkout_locks','owner_luid'], ['support_refresh_quota','support_refresh_quota','owner_luid'],
  ['support_intents','support_intents_as_buyer','buyer_luid'], ['support_intents','support_intents_as_author','author_luid'],
  ['support_payments','support_payments_as_buyer','buyer_luid'], ['support_payments','support_payments_as_author','author_luid'],
];

function jsonSafe(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof GeoPoint) return { $type:'geoPoint', latitude:value.latitude, longitude:value.longitude };
  if (value instanceof DocumentReference) return { $type:'documentReference', path:value.path };
  if (value && typeof value === 'object' && (value as {constructor?:{name?:string}}).constructor?.name === 'Bytes'
    && typeof (value as {toBase64?:unknown}).toBase64 === 'function') {
    return { $type:'bytes', base64:(value as {toBase64:()=>string}).toBase64() };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key,item]) => [key, SECRET_FIELD.test(key) ? '[redacted: security credential]' : jsonSafe(item)]));
  }
  return value;
}

const json = (value: unknown) => JSON.stringify(jsonSafe(value) ?? null);

function safeProviderPhotoUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url=new URL(value);
    for(const key of [...url.searchParams.keys()])if(SECRET_FIELD.test(key))url.searchParams.delete(key);
    return url.toString();
  } catch { return value; }
}

async function* ownedRecords(db: FirebaseFirestore.Firestore, luid: string, collection: string, field: string) {
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let query: Query = db.collection(collection).where(field,'==',luid).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) {
      const data = doc.data();
      // Expired telemetry is inaccessible even while Firestore TTL deletion is pending.
      if (collection === 'analytics_events' && (!(data.expires_at instanceof Timestamp) || data.expires_at.toMillis() <= Date.now())) continue;
      yield { id: doc.id, ...data };
    }
    if (page.size < PAGE_SIZE) return;
    cursor = page.docs.at(-1);
  }
}

function safeAuthRecord(user: UserRecord | null) {
  if (!user) return null;
  return {
      uid: user.uid, email: user.email ?? null, emailVerified: user.emailVerified, phoneNumber: user.phoneNumber ?? null,
      displayName: user.displayName ?? null, photoURL: safeProviderPhotoUrl(user.photoURL), disabled: user.disabled,
      providerData: user.providerData.map(provider => ({ providerId: provider.providerId, uid: provider.uid, email: provider.email ?? null,
        phoneNumber: provider.phoneNumber ?? null, displayName: provider.displayName ?? null, photoURL: safeProviderPhotoUrl(provider.photoURL) })),
      metadata: { creationTime: user.metadata.creationTime ?? null, lastSignInTime: user.metadata.lastSignInTime ?? null },
      customClaims: user.customClaims ?? {},
    };
}

async function safeAuthRecords(values: unknown[]) {
  const uids=[...new Set(values.filter((value):value is string=>typeof value==='string'&&value.length>0))];
  if(!uids.length)return new Map<string,ReturnType<typeof safeAuthRecord>>();
  const result=await adminAuth().getUsers(uids.map(uid=>({uid})));
  return new Map(result.users.map(user=>[user.uid,safeAuthRecord(user)]));
}

async function recheckExportAccess() {
  for (const permission of REQUIRED_PERMISSIONS) {
    const access = await requireAdminApi(permission);
    if (!access.ok) throw new Error('export_authorization_revoked');
  }
}

async function* base64File(file: ReturnType<ReturnType<typeof adminBucket>['file']>) {
  let tail = Buffer.alloc(0);
  for await (const chunk of file.createReadStream()) {
    const bytes = tail.length ? Buffer.concat([tail,Buffer.from(chunk)]) : Buffer.from(chunk);
    const completeLength = bytes.length - (bytes.length % 3);
    if (completeLength) yield bytes.subarray(0,completeLength).toString('base64');
    tail = bytes.subarray(completeLength);
  }
  if (tail.length) yield tail.toString('base64');
}

async function* userStorageFiles(luid: string, bucket: ReturnType<typeof adminBucket>, onFile: () => void) {
  for (const folder of STORAGE_FOLDERS) {
    const prefix = `${folder}/${luid}/`;
    let pageToken: string | undefined;
    do {
      const [files,nextQuery] = await bucket.getFiles({ prefix, maxResults: 250, autoPaginate: false, ...(pageToken ? { pageToken } : {}) });
      for (const file of files) {
        if (!file.name.startsWith(prefix)) continue;
        const [metadata] = await file.getMetadata();
        onFile();
        yield `{"path":${json(file.name)},"contentType":${json(metadata.contentType ?? null)},"size":${json(metadata.size ?? null)},"md5Hash":${json(metadata.md5Hash ?? null)},"dataBase64":"`;
        yield* base64File(file);
        yield '"}';
      }
      pageToken = nextQuery.pageToken;
    } while (pageToken);
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const profileAccess = await requireAdminApi('users.read'); if (!profileAccess.ok) return unauthorized(profileAccess);
  for (const permission of REQUIRED_PERMISSIONS.slice(1)) {
    const access = await requireAdminApi(permission); if (!access.ok) return unauthorized(access);
  }
  try {
    const body = request.headers.get('content-type')?.includes('application/json')
      ? await parseJson(request)
      : Object.fromEntries(await (async () => { const form=await request.formData(); return [...form.entries()]; })());
    const reason = requiredString(body.reason,'reason',8,1000);
    if (body.format !== 'json') throw new ValidationError('Complete user-data export is available as JSON');
    const scope = body.scope === 'all_users' ? 'all_users' : body.scope === 'admin_managed' ? 'admin_managed' : null;
    if (!scope) throw new ValidationError('scope must be all_users or admin_managed');
    const confirmed = body.confirmAllUsers === true || body.confirmAllUsers === 'on';
    if (scope === 'all_users' && !confirmed) throw new ValidationError('Confirm the sensitive all-user export');
    const limited = await enforceRateLimit(profileAccess.context.user.id,'users.full-export',2,60); if (limited) return limited;
    if (scope === 'all_users') {
      const allUsersLimited = await enforceRateLimit(profileAccess.context.user.id,'users.full-export.all-users',1,60);
      if (allUsersLimited) return allUsersLimited;
    }

    const db=adminDb(),bucket=adminBucket(),now=Date.now();
    let exportedUsers=0,exportedRecords=0,exportedFiles=0,completed=false;
    const auditExport=(status:'started'|'completed'|'failed'|'cancelled')=>recordAudit(crypto.randomUUID(),{
      actorId:profileAccess.context.user.id,action:scope==='all_users'?'all_user_data_export':'admin_created_user_data_export',
      resourceType:'user_directory',resourceId:null,
      after:{format:'json',status,scope,exportedUsers,exportedRecords,exportedFiles,
        included:['profile_and_private_identity','safe_firebase_auth_metadata','account_access_and_preferences','consented_unexpired_location_and_device_snapshots',
          'all_unexpired_user_analytics','owned_content_and_social_records','moderation_and_campaign_records','account_owned_storage_file_bytes_base64'],
        excluded:['password_hashes_and_password_salts','authentication_tokens_and_mfa_secrets','raw_push_delivery_tokens','admin_sessions_email_codes_and_invites',
          'admin_audit_log','crash_reports_not_linked_to_accounts','expired_or_revoked_location_device_snapshots']},
      reason,permissionKey:'users.read + users.full_export + users.location.read + users.telemetry.read',riskLevel:'sensitive',
    });
    await auditExport('started');

    const encode=new TextEncoder();
    const iterator=(async function*():AsyncGenerator<string>{
      try {
        yield '{"version":3,"scope":'+json(scope)+',"users":[';
        let cursor:QueryDocumentSnapshot|undefined,firstUser=true;
        while(true){
          await recheckExportAccess();
          let query:Query=db.collection('profiles');
          if(scope==='admin_managed')query=query.where('admin_managed','==',true);
          query=query.orderBy(FieldPath.documentId()).limit(10);
          if(cursor)query=query.startAfter(cursor);
          const page=await query.get(); if(page.empty)break;
          const activeProfiles=page.docs.filter(profile=>!profile.get('deleted_at'));
          const privateSnaps=activeProfiles.length?await db.getAll(...activeProfiles.map(profile=>db.collection('users_private').doc(profile.id))):[];
          const privateByLuid=new Map(activeProfiles.map((profile,index)=>[profile.id,privateSnaps[index]]));
          const authByUid=await safeAuthRecords(privateSnaps.map(snapshot=>snapshot.get('uid')));
          for(const profile of activeProfiles){
            const luid=profile.id;
            const [accessSnap,prefsSnap,locationSnap,deviceSnap,deletionSnap]=await db.getAll(
              db.collection('account_access').doc(luid),db.collection('user_data_preferences').doc(luid),
              db.collection('user_locations').doc(luid),db.collection('user_device_context').doc(luid),db.collection('account_deletion_jobs').doc(luid));
            if(deletionSnap.exists)continue;
            const privateData=privateByLuid.get(luid)?.data()??{};
            const preference=prefsSnap.data(),revision=preference?.revision;
            const current=(snapshot:FirebaseFirestore.DocumentSnapshot,enabled:unknown)=>{
              const data=snapshot.data(),expiry=data?.expires_at;
              return enabled===true&&data!==undefined&&data.consent_revision===revision&&expiry instanceof Timestamp&&expiry.toMillis()>now?data:null;
            };
            const authRecord=typeof privateData.uid==='string'?authByUid.get(privateData.uid)??null:null;
            yield `${firstUser?'':','}{"luid":${json(luid)},"profile":${json(profile.data())},"private":${json(privateData)},"auth":${json(authRecord)},`+
              `"accountAccess":${json(accessSnap.data()??null)},"dataPreferences":${json(preference??null)},`+
              `"location":${json(current(locationSnap,preference?.location))},"deviceContext":${json(current(deviceSnap,preference?.telemetry))},"records":{`;
            firstUser=false;exportedUsers++;
            let firstRecordGroup=true;
            const recordSets:Array<readonly [collection:string,key:string,field:string,owner:string]> = USER_RECORDS.map(([collection,key,field])=>[collection,key,field,luid]);
            if(typeof privateData.uid==='string')recordSets.push(['admin_role_assignments','admin_roles','user_id',privateData.uid]);
            recordSets.push(['moderation_flags','reports_filed','user_id',luid],
              ['moderation_flags','moderation_flags_as_author','metadata.author_id',luid],
              ['moderation_flags','moderation_flags_as_reported_user','metadata.reported_user_id',luid]);
            for(const [collection,key,field,owner] of recordSets){
              yield `${firstRecordGroup?'':','}${json(key)}:[`;firstRecordGroup=false;
              let first=true;
              for await(const record of ownedRecords(db,owner,collection,field)){
                const exported=collection==='moderation_flags'&&key!=='reports_filed'
                  ? {...record,user_id:null,reporter_identity_redacted:true}:record;
                yield `${first?'':','}${json(exported)}`;first=false;exportedRecords++;
              }
              yield ']';
            }
            yield `},"storageFiles":[`;
            let firstFile=true;
            for await(const entry of userStorageFiles(luid,bucket,()=>exportedFiles++)){
              yield `${firstFile?'':','}${entry}`;firstFile=false;
            }
            yield ']}';
          }
          cursor=page.docs.at(-1);if(page.size<10)break;
        }
        yield ']}';
        await recheckExportAccess();
        await auditExport('completed');completed=true;
      } catch(error){
        await auditExport('failed').catch(()=>undefined);
        console.error('[admin-user-export]',{code:String((error as {code?:unknown})?.code??'unexpected')});
        throw error;
      }
    })();
    const stream=new ReadableStream<Uint8Array>({
      async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encode.encode(next.value));}catch{controller.error(new Error('User-data export failed'));}},
      async cancel(){if(!completed){await iterator.return(undefined).catch(()=>undefined);await auditExport('cancelled').catch(()=>undefined);}},
    });
    const filename=`lociar-${scope==='all_users'?'all-users':'admin-managed-users'}-complete.json`;
    return new Response(stream,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Export-Scope':scope}});
  }catch(error){return apiError(error);}
}
