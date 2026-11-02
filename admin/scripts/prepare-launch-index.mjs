import {writeFileSync} from 'node:fs';
import {initializeOwnerRuntime,ownerActor} from './launch-runtime.mjs';
const {db,auth}=initializeOwnerRuntime();const actor=await ownerActor(db,auth);
const {requestMaintenanceRun}=await import('../lib/maintenance.ts');const{derivedKey}=await import('../lib/ops.ts');
const key=derivedKey('launch1680-prepare-map-index-v1','maintenance');
await requestMaintenanceRun('map_cells',actor,'Owner-requested launch preparation: repair the map index before publishing; do not publish posts.',key);
const deadline=Date.now()+540000;
while(Date.now()<deadline){
 const doc=await db.collection('maintenance_requests').doc(key).get();const status=doc.get('status');
 if(!['queued','running'].includes(status)){
  const flags=await db.collection('system').doc('geo_queries').get();const result={status,map_cells_version:flags.get('map_cells_version')??null,result:doc.get('result')??null,code:doc.get('code')??null,post_writes:0};
  writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(status!=='done'&&status!=='ok'&&status!=='completed')process.exitCode=1;break;
 }
 await new Promise(resolve=>setTimeout(resolve,5000));
}
