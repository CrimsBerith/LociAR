'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient,mutationError } from '../../../../lib/client-mutation';
import { emptyContent, type ContentInput } from '../../../../lib/content-models';
import AuthorPicker from '../users/AuthorPicker';
import MapPicker from '../MapPicker';

export default function ContentForm({postId,initial=emptyContent,canPublish=false,canOverride=false}:{postId?:string;initial?:ContentInput;canPublish?:boolean;canOverride?:boolean}){
 const router=useRouter(),mutation=useRef(createMutationClient());const[value,setValue]=useState(initial),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 function set<K extends keyof ContentInput>(key:K,v:ContentInput[K]){setValue(old=>({...old,[key]:v}));}
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');try{
  const{response,result}=await mutation.current.post(postId?`/api/admin/v1/posts/${postId}/edit`:'/api/admin/v1/posts',{...value,platform:'text',url:'',reason});
  if(!response.ok)throw new Error(result.error??'Post save failed');mutation.current.clear();
  router.push(`/admin/posts/${(result.post as {id:string}).id}`);router.refresh();setMessage('Post saved and audited.');
 }catch(error){setMessage(mutationError(error));}finally{setBusy(false);}}
 const numericFields=[['lat','Latitude',-90,90],['lng','Longitude',-180,180],['altitude','Altitude (m)',-500,10000],['heading','Heading (°)',0,360],['width','Width (m)',0.15,20],['height','Height (m)',0.15,20],['opacity','Opacity',0.05,1],['scale','Text scale',0.1,5],['rotation','Text rotation (°)',-360,360]] as const;
 return <form onSubmit={submit} className="contentEditor">
 <AuthorPicker value={value.authorId} onChange={id=>set('authorId',id)} disabled={Boolean(postId)}/>
 <fieldset><legend>Text</legend><label>Caption<input value={value.caption} onChange={e=>set('caption',e.target.value)} required maxLength={220}/></label>
 <label>AR text<textarea value={value.text} onChange={e=>set('text',e.target.value)} maxLength={2000}/></label>
 <label>Text color<input type="color" value={value.color} onChange={e=>set('color',e.target.value)}/></label>
 <div className="contentPreview" style={{color:value.color,background:value.background,opacity:value.opacity}} aria-label="Content preview"><p style={{transform:`rotate(${value.rotation}deg) scale(${value.scale})`}}>{value.text||value.caption}</p></div>
 </fieldset>
 <fieldset><legend>Location and approximate AR placement</legend><p className="muted">Choose any coordinate. This is an approximate placement; a physical world lock requires scanning at the location.</p>
 <MapPicker label="Post location map" center={{lat:value.lat,lng:value.lng}} zoom={16} onPick={p=>setValue(old=>({...old,lat:p.lat,lng:p.lng}))}
  shapes={[value.locationNote?{kind:'circle',lat:value.lat,lng:value.lng,radius:value.notifyRadius}:{kind:'point',lat:value.lat,lng:value.lng}]}
  hint="Click the map to place the post exactly; drag to pan and zoom out to reach any city."/>
 <div className="metricForm">{numericFields.map(([key,label,min,max])=><label key={key}>{label}<input type="number" value={value[key]} onChange={e=>set(key,Number(e.target.value))} min={min} max={max} step="any" required/></label>)}</div>
 <a href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=18/${value.lat}/${value.lng}`} target="_blank" rel="noreferrer">Check location in OpenStreetMap ↗</a>
 {postId?<label><input type="checkbox" checked={value.replacePlacement} onChange={e=>set('replacePlacement',e.target.checked)}/> If moving a physical post, replace its old AR lock with an approximate placement.</label>:null}
 {canOverride?<label>Protected-zone exception reason (only if needed)<textarea value={value.zoneExceptionReason} onChange={e=>set('zoneExceptionReason',e.target.value)} maxLength={1000}/></label>:null}
 </fieldset>
 <fieldset><legend>Location note</legend><label><input type="checkbox" checked={value.locationNote} onChange={e=>set('locationNote',e.target.checked)}/> Location note (shown on the map at this coordinate; can notify visitors)</label>
 {value.locationNote?<><label>Notification radius (m)<input type="number" min={15} max={100} step={1} value={value.notifyRadius} onChange={e=>set('notifyRadius',Number(e.target.value))} required/></label>
 <p className="muted">Phone GPS is usually 5–30 m off: 15–25 m outdoors, 30–60 m indoors, up to 100 m for large venues.</p>
 {canPublish?<label><input type="checkbox" checked={value.approveNotifications} onChange={e=>set('approveNotifications',e.target.checked)}/> Approve for notifications now (requires Publish active and Public)</label>:null}</>:null}
 </fieldset>
 <fieldset><legend>Publication</legend><label>Visibility<select value={value.visibility} onChange={e=>set('visibility',e.target.value as ContentInput['visibility'])}><option value="public">Public</option><option value="private">Private</option><option value="friends">Friends (currently owner-only)</option></select></label>
 <label>Age rating<select value={value.ageRating} onChange={e=>set('ageRating',e.target.value as ContentInput['ageRating'])}><option value="all">All ages</option><option value="13_plus">13+</option><option value="16_plus">16+</option></select></label>
 <label>Status<select value={value.status} onChange={e=>set('status',e.target.value as ContentInput['status'])}><option value="pending_review">Pending review</option>{canPublish?<option value="active">Publish active</option>:null}</select></label>
 <label>Audit reason<textarea value={reason} onChange={e=>setReason(e.target.value)} required minLength={8} maxLength={1000}/></label></fieldset>
 <button disabled={busy||!value.authorId}>{busy?'Saving…':postId?'Save changes':'Create post'}</button>{message?<p role="status">{message}</p>:null}
 </form>;
}
