import assert from 'node:assert/strict';
import test from 'node:test';
import {activeDensityPost,seedDensityConflicts} from '../scripts/seed-density.mjs';

const distance=(a,b,c,d)=>Math.hypot(a-c,b-d)*111195;
test('an isolated --only row still counts other live batches and normal posts',()=>{
 const row={id:'new',lat:0,lng:0,loaded:false};
 const live=[0,1,2].map(n=>({id:'other-'+n,lat:0,lng:n/111195}));
 assert.equal(seedDensityConflicts([row],live,distance).get('new'),4);
 assert.equal(seedDensityConflicts([row],live.slice(0,2),distance).size,0);
});
test('loaded counterparts count once at their actual live coordinates, and the 6 m boundary is inclusive',()=>{
 const live=[{id:'existing',lat:0,lng:0}];
 const selected=[{id:'existing',lat:99,lng:99,loaded:true},{id:'a',lat:0,lng:1/111195,loaded:false},{id:'b',lat:0,lng:2/111195,loaded:false},{id:'c',lat:0,lng:6/111195,loaded:false}];
 const result=seedDensityConflicts(selected,live,distance);
 assert.equal(result.has('existing'),false);assert.equal(result.get('a'),4);assert.equal(result.get('c'),4);
});
test('private, deleted and expired records do not count; malformed expiry remains conservative',()=>{
 const base={visibility:'public',deleted_at:null};
 assert.equal(activeDensityPost({...base,ends_at:new Date(500).toISOString()},1000),false);
 assert.equal(activeDensityPost({...base,ends_at:{toMillis:()=>2000}},1000),true);
 assert.equal(activeDensityPost({...base,ends_at:'invalid'},1000),true);
 assert.equal(activeDensityPost({...base,ends_at:{toMillis:1}},1000),true);
 assert.equal(activeDensityPost({...base,visibility:'private'},1000),false);
 assert.equal(activeDensityPost({...base,deleted_at:'deleted'},1000),false);
});
