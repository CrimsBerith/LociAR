import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../../../lib/admin';
import { apiError, unauthorized } from '../../../../../../lib/api';
import { adminDb } from '../../../../../../lib/firebase-admin';
export async function GET(request:Request){
  const access=await requireAdminApi('users.read');if(!access.ok)return unauthorized(access);
  try{
    const params=new URL(request.url).searchParams;
    const q=(params.get('q')??'').trim().toLowerCase().replace(/^@/,'');
    // Bulk tools resolve exact handles: one document read instead of a 21-row prefix scan.
    const exact=params.get('exact')==='1';
    if(!q||q.length>40)return NextResponse.json({users:[]});
    const db=adminDb();
    const matches=/^[0-9a-f-]{36}$/.test(q) ? [await db.collection('profiles').doc(q).get()]
      // A few rows, not one: a suspended or deleted profile still holding the handle must not hide the active one.
      : exact ? (await db.collection('profiles').where('handle','==',q).limit(5).get()).docs
      : (await db.collection('profiles').where('handle','>=',q).where('handle','<=',q+'\uf8ff').orderBy('handle').limit(21).get()).docs;
    return NextResponse.json({users:matches.filter(d=>d.exists&&!d.get('deleted_at')&&!d.get('suspended')).slice(0,20).map(d=>({id:d.id,handle:String(d.get('handle')),managed:d.get('admin_managed')===true})),hasMore:matches.length>20},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return apiError(error);}
}
