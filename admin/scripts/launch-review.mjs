// Counters and spot/index maintenance may change a document version after review.
// Rebase a version guard only when every reviewed content/identity/placement field is unchanged.
const reviewedFields=['caption','edit_data_json','content_source_json','creator_id','creator_handle','is_anonymous','note_kind','lat','lng','notify_radius_m','status','visibility','deleted_at','ends_at','seed_batch','admin_managed','push_state','age_rating','pose_json','anchor_bundle_json'];
export function reviewedContentUnchanged(current,baseline){
 return Boolean(current&&baseline)&&reviewedFields.every(field=>JSON.stringify(current[field])===JSON.stringify(baseline[field]));
}
export function renderedTextMatches(current,text){
 try{return JSON.parse(current?.edit_data_json??'{}').layers?.some(layer=>layer.type==='text'&&layer.text===text)===true}catch{return false}
}
