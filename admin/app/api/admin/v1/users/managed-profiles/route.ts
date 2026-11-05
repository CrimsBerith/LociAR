import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../../lib/api';
import { requireAdminApi } from '../../../../../../lib/admin';
import { adminDb } from '../../../../../../lib/firebase-admin';
import { normalizeManagedProfileUpdate, updateManagedProfile } from '../../../../../../lib/content-ops';
import { idempotencyKey, parseJson, requiredString, uuid, ValidationError } from '../../../../../../lib/validation';
import { derivedKey } from '../../../../../../lib/ops';

type ManagedUpdate = { luid: string; patch: Record<string, unknown> };

function rowsFrom(body: Record<string, unknown>, maxRows: number): ManagedUpdate[] {
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > maxRows) {
    throw new ValidationError(`Each batch must contain 1–${maxRows} managed profiles`);
  }
  const rows = body.rows.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`Row ${index + 1} must be an object`);
    const row = value as Record<string, unknown>;
    try {
      const luid = uuid(row.luid, 'luid').toLowerCase();
      const source = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile)
        ? row.profile as Record<string, unknown>
        : row;
      const patch = normalizeManagedProfileUpdate(source);
      return { luid, patch };
    } catch (error) {
      throw new ValidationError(`Row ${index + 1}: ${error instanceof Error ? error.message : 'invalid profile'}`);
    }
  });
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (seen.has(rows[i].luid)) throw new ValidationError(`Row ${i + 1}: duplicate LUID in file`);
    seen.add(rows[i].luid);
  }
  return rows;
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const access = await requireAdminApi('users.managed_profiles.write'); if (!access.ok) return unauthorized(access);
  try {
    const body = await parseJson(request), db = adminDb();
    if (body.mode !== 'preview' && body.mode !== 'update') throw new ValidationError('Invalid managed profile mode');
    if (body.mode === 'preview') {
      const rows = rowsFrom(body,50);
      const limited = await enforceRateLimit(access.context.user.id,'managed-profiles.preview',30,60); if (limited) return limited;
      const profiles = await db.getAll(...rows.map(row=>db.collection('profiles').doc(row.luid)));
      const results = rows.map((row,index)=>{
        const profile=profiles[index];
        const error=!profile.exists||profile.get('deleted_at')?'profile_not_found':profile.get('admin_managed')!==true?'not_admin_managed':null;
        return {luid:row.luid,handle:profile.get('handle')??null,displayName:profile.get('display_name')??null,patch:row.patch,error};
      });
      return NextResponse.json({results,valid:results.filter(row=>!row.error).length,invalid:results.filter(row=>row.error).length});
    }
    const rows=rowsFrom(body,10), reason=requiredString(body.reason,'reason',8,1000);
    const limited=await enforceRateLimit(access.context.user.id,'managed-profiles.update',30,60); if(limited)return limited;
    const key=idempotencyKey(request),results:Array<{luid:string;updated:boolean;error?:string}> = [];
    for(const row of rows){
      try{
        await updateManagedProfile(row.luid,row.patch,access.context.user.id,reason,derivedKey(key,`profile:${row.luid}`));
        results.push({luid:row.luid,updated:true});
      }catch(error){results.push({luid:row.luid,updated:false,error:error instanceof Error?error.message:'unexpected'});}
    }
    return NextResponse.json({results,updated:results.filter(row=>row.updated).length,failed:results.filter(row=>!row.updated).length});
  }catch(error){return apiError(error);}
}
