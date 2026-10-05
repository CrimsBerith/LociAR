import test from 'node:test';import assert from 'node:assert/strict';
import {mapSecurityProjection} from '../world-map-security-migration.mjs';
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-5222-8222-222222222222',path=`post-world-maps/${owner}/${id}/map.lociarmap`;
const base={creator_id:owner,status:'active',visibility:'public',anchor_bundle_json:JSON.stringify({anchor:{persistence:{assetURI:'storage://'+path}}})};
test('migration binds legacy map locators to the exact post and never admits foreign paths',()=>{
 assert.deepEqual(mapSecurityProjection(id,base,true),{post_id:id,creator_id:owner,state:'committed',world_map_path:path,public_readable:true});
 for(const locator of['https://example.test/bearer',path.replace(owner,id),path+'/extra'])assert.equal(mapSecurityProjection(id,{...base,world_map_path:locator},true).world_map_path,null);
 assert.equal(mapSecurityProjection('invalid',base,true),null);
});
test('migration preserves removed, adult, private and inactive-owner read fences',()=>{
 for(const extra of[{age_rating:'18_plus'},{deleted_at:'now'},{status:'removed'},{status:'pending_review'},{visibility:'friends'},{visibility:'private'}])assert.equal(mapSecurityProjection(id,{...base,...extra},true).public_readable,false);
 assert.equal(mapSecurityProjection(id,base,false).public_readable,false);assert.equal(mapSecurityProjection(id,{...base,status:'removed'},true).state,'removed');
});
