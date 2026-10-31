import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewedContentUnchanged,renderedTextMatches} from '../scripts/launch-review.mjs';
test('group/counter maintenance can rebase a review without permitting content or identity changes',()=>{
 const reviewed={caption:'Reviewed',edit_data_json:'text layer',creator_id:'author',is_anonymous:true,lat:1,lng:2,pose_json:'pose',status:'active',push_state:'none',likes_count:0,spot_id:null};
 assert.equal(reviewedContentUnchanged({...reviewed,likes_count:1,spot_id:'new-group',updated_at:'later'},reviewed),true);
 for(const change of [{caption:'Changed'},{edit_data_json:'Changed layer'},{creator_id:'other'},{is_anonymous:false},{lat:3},{pose_json:'moved'},{status:'removed'},{push_state:'approved'}])assert.equal(reviewedContentUnchanged({...reviewed,...change},reviewed),false);
 assert.equal(reviewedContentUnchanged(undefined,reviewed),false);
});
test('a correct caption cannot conceal changed or malformed rendered note content',()=>{
 const current={caption:'Expected',edit_data_json:JSON.stringify({layers:[{type:'text',text:'Changed'}]})};
 assert.equal(renderedTextMatches(current,'Expected'),false);
 assert.equal(renderedTextMatches({...current,edit_data_json:'broken'},'Expected'),false);
 assert.equal(renderedTextMatches({...current,edit_data_json:JSON.stringify({layers:[{type:'text',text:'Expected'}]})},'Expected'),true);
});
