'use client';
import { useState,useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient,mutationError } from '../../../../lib/client-mutation';
import AuthorPicker from '../users/AuthorPicker';
import { useT } from '../../I18nProvider';
export default function CommentForm({postId,commentId,initialAuthor='',initialText=''}:{postId:string;commentId?:string;initialAuthor?:string;initialText?:string}){
 const t=useT(),router=useRouter(),mutation=useRef(createMutationClient());const[authorId,setAuthor]=useState(initialAuthor),[text,setText]=useState(initialText),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(action:'create'|'edit'|'delete'){setBusy(true);setMessage('');try{const{response,result}=await mutation.current.post(`/api/admin/v1/posts/${postId}/comments`,{action,authorId,text,reason,...(commentId?{commentId}:{})});
 if(!response.ok)throw new Error(result.error??'Comment action failed');mutation.current.clear();setMessage(t('Comment saved and audited.'));if(!commentId)setText('');router.refresh();}catch(error){setMessage(t(mutationError(error)));}finally{setBusy(false);}}
 return <form className="commentEditor" onSubmit={e=>{e.preventDefault();void submit(commentId?'edit':'create');}}>
 {commentId?<small>{t('Author')}: {authorId}</small>:<AuthorPicker value={authorId} onChange={setAuthor}/>}
 <label>{t('Comment')}<textarea aria-label={t('Comment text')} value={text} onChange={e=>setText(e.target.value)} required minLength={1} maxLength={500}/></label>
 <label>{t('Reason')}<input aria-label={t('Comment reason')} value={reason} onChange={e=>setReason(e.target.value)} required minLength={8} maxLength={1000}/></label>
 <div className="buttonRow"><button type="submit" disabled={busy||!authorId||reason.trim().length<8}>{commentId?t('Save comment'):t('Create comment')}</button>{commentId?<button type="button" className="dangerButton" disabled={busy||reason.trim().length<8} onClick={()=>submit('delete')}>{t('Delete comment')}</button>:null}</div>{message?<p role="status">{message}</p>:null}</form>;
}
