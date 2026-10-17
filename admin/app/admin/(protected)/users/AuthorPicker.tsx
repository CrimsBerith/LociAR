'use client';
import { useEffect, useState } from 'react';
import { useT } from '../../I18nProvider';
export default function AuthorPicker({value,onChange,disabled=false}:{value:string;onChange:(id:string)=>void;disabled?:boolean}){
  const t=useT();
  const [query,setQuery]=useState(value),[users,setUsers]=useState<Array<{id:string;handle:string;managed:boolean}>>([]),[message,setMessage]=useState('');
  useEffect(()=>{
    if(disabled||query.trim().length<2){setUsers([]);return;}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/api/admin/v1/users/lookup?q='+encodeURIComponent(query),{signal:controller.signal,cache:'no-store'});
        const data=await response.json();if(!response.ok)throw new Error(data.error??'User lookup failed');
        setUsers(data.users);setMessage(data.hasMore?'Narrow the handle prefix to find more users.':'');
      }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'User lookup failed');}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,disabled]);
  return <fieldset><legend>{t('Content author')}</legend>
    <label>{t('Find user by @handle or ID')}<input value={query} onChange={e=>setQuery(e.target.value)} disabled={disabled} aria-label={t('Find content author')} /></label>
    {!disabled&&users.length?<select value={value} onChange={e=>onChange(e.target.value)} aria-label={t('Select content author')}><option value="">{t('Select a user')}</option>{users.map(u=><option key={u.id} value={u.id}>@{u.handle}{u.managed?' · '+t('managed'):''}</option>)}</select>:null}
    <label>{t('Selected user ID')}<input value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} required aria-label={t('Content author ID')} /></label>
    <small>{message?t(message):t('This user is the public author. The acting administrator is recorded separately in audit.')}</small>
  </fieldset>;
}
