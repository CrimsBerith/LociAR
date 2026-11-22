'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../I18nProvider';
export default function AuthorPicker({value,onChange,disabled=false}:Readonly<{value:string;onChange:(id:string)=>void;disabled?:boolean}>){
  const t=useT();
  const [query,setQuery]=useState(value),[users,setUsers]=useState<Array<{id:string;handle:string;managed:boolean}>>([]),[message,setMessage]=useState('');
  // A parent reset (a selected value cleared after a successful post) clears the search box too.
  // Only on that transition: on mount it would wipe text typed before hydration finished.
  const previousValue=useRef(value);
  useEffect(()=>{if(previousValue.current&&!value)setQuery('');previousValue.current=value;},[value]);
  useEffect(()=>{
    if(disabled||query.trim().length<2){setUsers([]);setMessage('');return;}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/api/admin/v1/users/lookup?q='+encodeURIComponent(query),
          {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15_000)]),cache:'no-store'});
        const data=await response.json().catch(()=>null) as {users?:unknown;hasMore?:unknown;error?:unknown}|null;
        if(!response.ok||!data||!Array.isArray(data.users))throw new Error(typeof data?.error==='string'?data.error:'User lookup failed');
        setUsers(data.users as Array<{id:string;handle:string;managed:boolean}>);setMessage(data.hasMore?'Narrow the handle prefix to find more users.':'');
      }catch(error){if(!controller.signal.aborted){setUsers([]);setMessage(error instanceof Error&&error.name!=='TimeoutError'?error.message:'User lookup failed');}}
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
