import{writeFileSync,mkdirSync}from'node:fs';
import{initializeOwnerRuntime,ownerActor}from'./launch-runtime.mjs';
const{db,auth}=initializeOwnerRuntime();const out=process.argv[2];if(!out)throw Error('Output directory required');mkdirSync(out,{recursive:true});
const actor=await ownerActor(db,auth);
const [posts,zones]=await Promise.all([db.collection('posts').select('caption','edit_data_json','content_source_json','creator_id','creator_handle','is_anonymous','note_kind','lat','lng','notify_radius_m','status','visibility','deleted_at','ends_at','seed_batch','admin_managed','updated_at','push_state','age_rating','width','height','pose_json','anchor_bundle_json','altitude','heading').limit(5001).get(),db.collection('protected_zones').where('active','==',true).get()]);
if(posts.size>5000)throw Error('Post inventory cap exceeded');
const rows=posts.docs.map(d=>({post_id:d.id,document_update_time:`${d.updateTime.seconds}:${d.updateTime.nanoseconds}`,...d.data()}));const creators=[...new Set(rows.map(x=>x.creator_id))];const profiles=await db.getAll(...creators.map(id=>db.collection('profiles').doc(id)));
const data={read_only:true,read_at:new Date().toISOString(),actor_uid:actor,posts:rows,zones:zones.docs.map(d=>({id:d.id,...d.data()})),authors:profiles.map(d=>({id:d.id,handle:d.get('handle'),admin_managed:d.get('admin_managed'),suspended:d.get('suspended'),deleted_at:d.get('deleted_at')}))};
writeFileSync(out+'/live.json',JSON.stringify(data,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({posts:rows.length,authors:creators.length,zones:zones.size,active_owner_found:true}));
