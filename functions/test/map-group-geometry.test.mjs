import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNoteGroups, mapGroupSummary, splitSpotPlan } from '../lib/mapNoteGroups.js';
import { joinSpot, distanceToSpot, fixUnlocksSpot, SPOT_JOIN_RADIUS_M } from '../lib/placeNoteRules.js';
import { distanceMeters } from '../lib/geo.js';
const step = 180 / (Math.PI * 6371008.8);
const point = (n, id, spotId = 'legacy') => ({ id, lat: n * step, lng: 29, spotId });
const chain = Array.from({length:17}, (_,i)=>point(153*i/16, String(i).padStart(2,'0')));
function invariant(posts, groups) {
  assert.deepEqual(groups.flatMap(g=>g.post_ids).sort(), posts.map(p=>p.id).sort());
  const byId=new Map(posts.map(p=>[p.id,p]));
  for (const g of groups) for(const id of g.post_ids) {
    const p=byId.get(id);
    assert.ok(distanceMeters(g.lat,g.lng,p.lat,p.lng)<=25, `${id} outside ${g.id}`);
    assert.ok(g.radius<=25);
  }
}
test('17 notes spanning 153 m partition without loss or edge chaining',()=>{
  const groups=mapNoteGroups(chain);invariant(chain,groups);
  assert.ok(groups.length>=4);assert.deepEqual(mapNoteGroups(chain.toReversed()),groups);
  assert.throws(()=>mapGroupSummary('spot:legacy',chain),/separate 25 m/);
});
test('asymmetric means fall back to their fixed anchor',()=>{
  const posts=[point(0,'00'),point(-24,'01'),...Array.from({length:20},(_,i)=>point(24,`r${i}`))];
  const groups=mapNoteGroups(posts);invariant(posts,groups);assert.equal(groups.length,1);assert.equal(groups[0].lat,0);
});
test('same coordinate: ten notes remain one group',()=>{
 const posts=Array.from({length:10},(_,i)=>point(0,String(i))); const groups=mapNoteGroups(posts);
 invariant(posts,groups);assert.equal(groups.length,1);assert.equal(groups[0].count,10);assert.equal(groups[0].radius,0);
});
test('date line means and member distances stay correct',()=>{
 const posts=[{id:'a',lat:0,lng:179.99995,spotId:'legacy'},{id:'b',lat:0,lng:-179.99995,spotId:'legacy'}];
 const groups=mapNoteGroups(posts);invariant(posts,groups);assert.equal(groups.length,1);assert.ok(Math.abs(groups[0].lng)>179.9999);
});
test('membership uses centre distance; joining cannot move any existing member',()=>{
 const spot={lat:0,lng:29,radius:24,count:100}; const next=joinSpot(spot,point(25,'x').lat,29);
 assert.equal(next.lat,spot.lat);assert.equal(next.lng,spot.lng);assert.equal(next.count,101);assert.ok(next.radius<=25);
 assert.throws(()=>joinSpot(spot,point(26,'x').lat,29),/outside 25 m/);
 assert.ok(distanceToSpot(point(60,'x').lat,29,{...spot,radius:40})>59);
 assert.equal(fixUnlocksSpot({...point(14,'x'),accuracy:3,measuredAt:0},{...spot,radius:10},2),true);
 assert.equal(fixUnlocksSpot({...point(16,'x'),accuracy:3,measuredAt:0},{...spot,radius:10},2),false);
});
test('offline plan keeps source-centre members; every note assigned exactly once and rerun retains them',()=>{
 const centre={lat:point(76.5,'x').lat,lng:29,radius:40}; const plan=splitSpotPlan('old',centre,chain);invariant(chain,plan);
 const retained=chain.filter(p=>distanceMeters(centre.lat,centre.lng,p.lat,p.lng)<=25);
 assert.deepEqual(plan.find(g=>g.id==='old').post_ids,retained.map(p=>p.id));
 assert.deepEqual(splitSpotPlan('old',centre,retained),[plan.find(g=>g.id==='old')]);
 assert.deepEqual(splitSpotPlan('old',centre,chain.toReversed()),plan);
});
test('physical geometry is fixed before viewer-specific member intersection',()=>{
 const raw=mapNoteGroups(chain), ids=new Set(['00','02','04']);
 const projected=raw.map(g=>({...g,post_ids:g.post_ids.filter(id=>ids.has(id))}));
 for(let i=0;i<raw.length;i++) assert.deepEqual([projected[i].lat,projected[i].lng,projected[i].radius],[raw[i].lat,raw[i].lng,raw[i].radius]);
 const first=raw.find(g=>g.post_ids.includes('00'));assert.ok(!first.post_ids.includes('16'));
});
test('deterministic random geometry satisfies the 25 m invariant',()=>{
 let state=1729; const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
 for(let run=0;run<50;run++){
  const posts=Array.from({length:300},(_,i)=>({id:String(i).padStart(4,'0'),lat:(random()-.5)*.006,lng:((179.999+(random()-.5)*.006+540)%360)-180,spotId:i%3?'legacy':undefined}));
  invariant(posts,mapNoteGroups(posts));
 }
 assert.equal(SPOT_JOIN_RADIUS_M,25);
});
