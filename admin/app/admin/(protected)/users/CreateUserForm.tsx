'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient,mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';
export default function CreateUserForm(){
 const t=useT(),router=useRouter(),mutation=useRef(createMutationClient());const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);setBusy(true);setMessage('');
  try{const{response,result}=await mutation.current.post('/api/admin/v1/users/create',Object.fromEntries(data));if(!response.ok)throw new Error(result.error??'User creation failed');
   const user=result.user as {id:string;handle:string};setMessage(t('Created @{handle} · {id}',{handle:user.handle,id:user.id}));mutation.current.clear();form.reset();router.refresh();
  }catch(error){setMessage(t(mutationError(error)));}finally{setBusy(false);}}
 return <section className="panel"><h2>{t('Create content user')}</h2><p className="muted">{t('Creates a managed profile with a disabled Firebase login. Email stays unverified and no admin role is granted.')}</p>
 <form onSubmit={submit} className="metricForm"><label>{t('Handle')}<input name="handle" required pattern="[a-z0-9_.]{3,30}" minLength={3} maxLength={30}/></label>
 <label>{t('Display name')}<input name="displayName" required maxLength={60}/></label><label>{t('Email (optional)')}<input name="email" type="email" maxLength={254}/></label>
 <label>{t('User creation reason')}<input name="reason" required minLength={8} maxLength={1000}/></label><button type="submit" disabled={busy}>{t('Create user')}</button></form>{message?<p role="status">{message}</p>:null}</section>;
}
