import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {deploymentEnvironment} from './firebase-deploy.mjs';
const project='lociar-2f38c';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function mapSecurityProjection(id,post,authorActive){
 if(!uuid.test(id)||typeof post.creator_id!=='string'||!uuid.test(post.creator_id))return null;
 let bundle;try{bundle=typeof post.anchor_bundle_json==='string'?JSON.parse(post.anchor_bundle_json):post.anchor_bundle_json;}catch{}
 const persistence=bundle?.anchor?.persistence??bundle?.persistence;
 const candidate=post.world_map_path??persistence?.assetURI??persistence?.assetUri??persistence?.storagePath;
 const path=typeof candidate==='string'?candidate.replace(/^storage:\/\//,''):null;
 const prefix=`post-world-maps/${post.creator_id}/${id}/`;
 const admittedPath=path?.startsWith(prefix)&&/^[^/]+\.lociarmap$/.test(path.slice(prefix.length))?path:null;
 return {post_id:id,creator_id:post.creator_id,state:post.deleted_at||post.status==='removed'?'removed':'committed',world_map_path:admittedPath,
  public_readable:!!(authorActive&&post.status==='active'&&post.visibility==='public'&&post.age_rating!=='18_plus'&&!post.deleted_at)};
}
async function main(args){
 const allowed=new Set(['--apply','--project','--max-pages','--post-cursor','--object-cursor']);const options={apply:false,pages:20,postCursor:null,objectCursor:null};
 for(let i=0;i<args.length;i++){const flag=args[i];if(!allowed.has(flag))throw new Error('Unknown option: '+flag);if(flag==='--apply'){options.apply=true;continue;}const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing '+flag);
  if(flag==='--project'&&value!==project)throw new Error('Wrong project');if(flag==='--project')options.project=value;
  if(flag==='--max-pages')options.pages=Number(value);if(flag==='--post-cursor')options.postCursor=value;if(flag==='--object-cursor')options.objectCursor=value;
 }
 if(options.project!==project||!Number.isInteger(options.pages)||options.pages<1||options.pages>100)throw new Error('Usage: node scripts/world-map-security-migration.mjs --project lociar-2f38c [--apply] [--max-pages 1..100] [--post-cursor ID] [--object-cursor NAME]');
 if(['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>process.env[k]))throw new Error('Live migration rejects emulator selectors');
 // A managed cloud session must select its configured user GCP connection; never fall
 // back to the platform bootstrap identity. Local operator ADC remains supported.
 if(process.env.OIC_MANIFEST_PATH)Object.assign(process.env,deploymentEnvironment(process.env));
 const require=createRequire(new URL('../functions/package.json',import.meta.url));const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getStorage}=require('firebase-admin/storage');
 initializeApp({projectId:project,storageBucket:project+'.firebasestorage.app'});const db=getFirestore(),bucket=getStorage().bucket();const summary={apply:options.apply,posts:0,skipped:0,tokens:0,nextPost:options.postCursor,nextObject:options.objectCursor};
 for(let page=0;page<options.pages;page++){
  let query=db.collection('posts').orderBy('__name__').limit(100);if(summary.nextPost)query=query.startAfter(summary.nextPost);const docs=await query.get();
  for(const doc of docs.docs){await db.runTransaction(async tx=>{
    const p=await tx.get(doc.ref);if(!p.exists||typeof p.get('creator_id')!=='string'){summary.skipped++;return;}
    const owner=p.get('creator_id');const[profile,deletion,claim]=await tx.getAll(db.collection('profiles').doc(owner),db.collection('account_deletion_jobs').doc(owner),db.collection('storage_reclamations').doc(doc.id));
    if(deletion.exists||['pending','reclaimed'].includes(claim.get('state'))){summary.skipped++;return;}
    const projection=mapSecurityProjection(doc.id,p.data(),profile.exists&&!profile.get('deleted_at')&&!profile.get('suspended'));if(!projection){summary.skipped++;return;}
    if(options.apply){tx.set(claim.ref,projection,{merge:true});tx.update(doc.ref,{world_map_path:projection.world_map_path});}summary.posts++;
  });}
  summary.nextPost=docs.size===100?docs.docs.at(-1).id:null;if(!summary.nextPost)break;
 }
 for(let page=0;page<options.pages;page++){
  const[files]=await bucket.getFiles({prefix:'post-world-maps/',maxResults:200,autoPaginate:false,...(summary.nextObject?{startOffset:summary.nextObject}: {})});
  for(const file of files){const metadata=file.metadata;if(!metadata.metadata?.firebaseStorageDownloadTokens)continue;summary.tokens++;
   const generation=String(metadata.generation??'');if(!/^[1-9][0-9]*$/.test(generation))throw new Error('Missing exact object generation');
   if(options.apply)await file.setMetadata({metadata:{firebaseStorageDownloadTokens:null}},{preconditionOpts:{ifGenerationMatch:generation}});
  }
  summary.nextObject=files.length===200?files.at(-1).name+'\u0000':null;if(!summary.nextObject)break;
 }
 console.log(JSON.stringify(summary,null,2));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
