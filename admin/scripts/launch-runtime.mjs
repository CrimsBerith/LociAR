// Owner-run CLI uses existing ADC. No credentials or tokens are written to disk.
import {execFileSync} from 'node:child_process';
import {initializeApp,getApps,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
export function initializeOwnerRuntime(){
 if(['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>process.env[k]))throw new Error('Production owner runtime refuses emulator selectors.');
 process.env.GOOGLE_CLOUD_PROJECT='lociar-2f38c';
 if(!getApps().length)initializeApp({projectId:'lociar-2f38c',storageBucket:'lociar-2f38c.firebasestorage.app',credential:applicationDefault()});
 return {db:getFirestore(),auth:getAuth()};
}
export async function ownerActor(db,auth){
 const roles=await db.collection('admin_role_assignments').where('role_key','==','super_admin').where('revoked_at','==',null).get();
 const ids=[...new Set(roles.docs.map(d=>d.get('user_id')))];const users=(await Promise.all(ids.map(id=>auth.getUser(id)))).filter(u=>!u.disabled);
 const account=execFileSync('gcloud',['--configuration=default','config','get-value','account'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().toLowerCase();
 const actor=users.find(u=>u.email?.toLowerCase()===account)||(users.length===1?users[0]:null);
 if(!actor)throw new Error('No unambiguous active owner admin found.');return actor.uid;
}
