'use client';
import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

type Persona = { handle: string; displayName: string; email?: string; bio?: string; avatarPreset?: string };
type Preview = { rows: Persona[]; conflicts: Array<{row:number;handle:string;error:string}> };

function parseCsv(text: string): Persona[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  if (!rows.length) throw new Error('File is empty');
  const headers = rows.shift()!.map(value => value.trim());
  const handleIndex = headers.indexOf('handle'), nameIndex = headers.indexOf('displayName') >= 0 ? headers.indexOf('displayName') : headers.indexOf('display_name');
  const profileIndex = headers.indexOf('profile_json'), privateIndex = headers.indexOf('private_json');
  if (profileIndex >= 0) return rows.map(values => {
    const profile = JSON.parse(values[profileIndex] || '{}') as Record<string,unknown>, privateData = privateIndex >= 0 ? JSON.parse(values[privateIndex] || '{}') as Record<string,unknown> : {};
    return { handle:String(profile.handle ?? ''), displayName:String(profile.display_name ?? ''), bio:String(profile.bio ?? ''),
      avatarPreset:String(profile.avatar_preset ?? ''), email:typeof privateData.email === 'string' ? privateData.email : undefined };
  });
  if (handleIndex < 0 || nameIndex < 0) throw new Error('CSV needs handle and displayName columns');
  const get = (values: string[], ...keys: string[]) => { const index = headers.findIndex(header => keys.includes(header)); return index < 0 ? '' : values[index] ?? ''; };
  return rows.map(values => ({ handle: values[handleIndex] ?? '', displayName: values[nameIndex] ?? '', email: get(values,'email') || undefined,
    bio: get(values,'bio'), avatarPreset: get(values,'avatarPreset','avatar_preset') }));
}

async function readFile(file: File): Promise<Persona[]> {
  if (file.size > 100_000_000) throw new Error('File must be under 100 MB');
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsed: unknown = JSON.parse(text), values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ?
      ((parsed as {profiles?:unknown;users?:unknown}).profiles ?? (parsed as {users?:unknown}).users) : null;
    if (!Array.isArray(values)) throw new Error('JSON must be an array or contain a profiles array');
    return values.map(value => {
      if (!value || typeof value !== 'object') return value as Persona;
      const record = value as Record<string,unknown>, profile = record.profile && typeof record.profile === 'object' ? record.profile as Record<string,unknown> : record;
      const privateData = record.private && typeof record.private === 'object' ? record.private as Record<string,unknown> : {};
      return { handle:String(profile.handle ?? ''), displayName:String(profile.displayName ?? profile.display_name ?? ''), email:typeof privateData.email === 'string' ? privateData.email : typeof record.email === 'string' ? record.email : undefined,
        bio:typeof profile.bio === 'string' ? profile.bio : '', avatarPreset:String(profile.avatarPreset ?? profile.avatar_preset ?? '') };
    });
  }
  return parseCsv(text);
}

export default function PersonaTransfer({ canImport, canExport, exportStepUpRequired }: { canImport: boolean; canExport: boolean; exportStepUpRequired: boolean }) {
  const t = useT(), mutation = useRef(createMutationClient()), fileRef = useRef<HTMLInputElement>(null);
  const [rows,setRows] = useState<Persona[]>([]), [preview,setPreview] = useState<Preview|null>(null), [reason,setReason] = useState(''), [message,setMessage] = useState(''), [busy,setBusy] = useState(false), [partial,setPartial] = useState(false);
  const [exportScope,setExportScope] = useState<'admin_managed'|'all_users'|''>(''), [confirmAllUsers,setConfirmAllUsers] = useState(false);
  async function postWithRateRetry(payload: unknown) {
    while (true) {
      const result = await mutation.current.post('/api/admin/v1/users/import',payload);
      if (result.response.status === 429) {
        const seconds = Math.max(1,Number(result.response.headers.get('Retry-After')) || 60);
        setMessage(`Rate limit reached. Continuing in ${seconds} seconds…`);
        await new Promise(resolve=>setTimeout(resolve,seconds*1000)); continue;
      }
      if (!result.response.ok) throw new Error(result.result.error ?? 'Import action failed');
      return result.result;
    }
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    try { const parsed = await readFile(file); setRows(parsed); setPreview(null); setMessage(`${parsed.length} profiles loaded`); }
    catch (error) { setRows([]); setPreview(null); setMessage(mutationError(error)); }
  }
  async function validate() {
    setBusy(true); setMessage('');
    try {
      const conflicts: Preview['conflicts'] = [];
      for (let start=0; start<rows.length; start+=50) {
        const result = await postWithRateRetry({mode:'preview',rows:rows.slice(start,start+50)}) as Preview;
        conflicts.push(...(result.conflicts.map(conflict=>({...conflict,row:conflict.row+start}))));
        setMessage(`${Math.min(start+50,rows.length)} / ${rows.length} checked`);
      }
      setPreview({rows,conflicts}); setPartial(false); setMessage('Review the rows, then import. Existing handles are reported as conflicts.');
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setMessage('');
    try {
      let created=0; const failures:Array<{handle:string;error:string}> = [];
      for (let start=0; start<rows.length; start+=10) {
        const batch=rows.slice(start,start+10), result = await postWithRateRetry({mode:'import',rows:batch,reason});
        const summary = result as {created:number;results:Array<{handle:string;id?:string;error?:string}>}; created += summary.created;
        failures.push(...summary.results.filter(row=>row.error).map(row=>({handle:row.handle,error:row.error!})));
        setMessage(`${Math.min(start+batch.length,rows.length)} / ${rows.length} processed`);
      }
      setMessage(`${created} created · ${failures.length} failed${failures.length ? `: ${failures.map(row=>`${row.handle} (${row.error})`).join(', ')}` : ''}`);
      if (failures.length) setPartial(true);
      else { setRows([]); setPreview(null); setReason(''); setPartial(false); if (fileRef.current) fileRef.current.value = ''; mutation.current.clear(); }
    } catch (error) { setPartial(true); setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <section className="panel">
    <h2>{t('User data transfer')}</h2>
    <p className="muted">{t('Choose an export scope. Complete JSON contains retained account records, content and social activity, safe Firebase sign-in metadata, and the account’s stored files. Passwords, login tokens, raw push tokens, admin sessions and audit logs are excluded. Import creates new managed profiles and never copies server-owned identity, verification, consent, or counters.')}</p>
    <div className="inlineSearch">
      {canImport ? <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" onChange={event=>void chooseFile(event.currentTarget.files?.[0])} aria-label={t('Choose persona file')} /> : null}
    </div>
    {canExport ? <form action="/api/admin/v1/users/export" method="post" className="metricForm">
        <input type="hidden" name="format" value="json" />
        <label>{t('Export scope')}<select name="scope" value={exportScope} aria-label={t('Export scope')} disabled={busy} required onChange={event=>{setExportScope(event.target.value as typeof exportScope);setConfirmAllUsers(false);}}>
          <option value="">{t('Choose export scope')}</option>
          <option value="admin_managed">{t('Admin-managed profiles only')}</option>
          <option value="all_users">{t('All user profiles')}</option>
        </select></label>
        {exportScope === 'all_users' ? <label><input type="checkbox" name="confirmAllUsers" value="on" checked={confirmAllUsers} required disabled={busy} onChange={event=>setConfirmAllUsers(event.target.checked)} /> {t('I understand this exports sensitive data for all users to this device.')}</label> : null}
        <label>{t('Full export reason')}<input name="reason" value={reason} onChange={event=>setReason(event.target.value)} minLength={8} maxLength={1000} required /></label>
        <button type="submit" disabled={busy || !exportScope || (exportScope === 'all_users' && !confirmAllUsers) || reason.trim().length<8}>{t('Download complete user data JSON')}</button>
      </form> : <p className="muted">{t(exportStepUpRequired ? 'Sign in with the authenticator method to export full user data.' : 'Full export requires dedicated bulk export, user read, location, and telemetry permissions.')}</p>}
    {canImport && rows.length ? <>
      <p>{t('{count} profiles loaded',{count:rows.length})}</p>
      <button type="button" disabled={busy} onClick={()=>void validate()}>{t('Validate and preview')}</button>
    </> : null}
    {preview ? <>
      <p>{t('Preview shows the first {count} rows.',{count:Math.min(preview.rows.length,100)})}</p>
      <div className="tableWrap"><table><thead><tr><th>{t('Handle')}</th><th>{t('Display name')}</th><th>{t('Bio')}</th><th>{t('Avatar preset')}</th><th>{t('Email')}</th></tr></thead>
        <tbody>{preview.rows.slice(0,100).map((row,index)=><tr key={`${row.handle}-${index}`}><td>@{row.handle}</td><td>{row.displayName}</td><td>{row.bio}</td><td>{row.avatarPreset}</td><td>{row.email ? t('Provided') : ''}</td></tr>)}</tbody></table></div>
      {preview.conflicts.length ? <p role="alert">{t('Handle conflicts')}: {preview.conflicts.map(row=>`@${row.handle} (row ${row.row})`).join(', ')}</p> : null}
      <label>{t('User creation reason')}<input value={reason} onChange={event=>setReason(event.target.value)} minLength={8} maxLength={1000} required /></label>
      <button type="button" disabled={busy || (!partial && !!preview.conflicts.length) || reason.trim().length < 8} onClick={()=>void apply()}>{t(partial ? 'Retry import' : 'Create managed profiles')}</button>
    </> : null}
    {message ? <output aria-live="polite">{message}</output> : null}
  </section>;
}
