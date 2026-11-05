'use client';

import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

type BioRow = { handle: string; bio: string };
type Target = { id: string; handle: string; managed: boolean };
type ImageRow = { handle: string; file: File };
type Result = { handle: string; status: string };

function parseCsv(text: string): BioRow[] {
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
      row.push(cell); cell = ''; if (row.some(value => value.trim())) rows.push(row); row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('Bio CSV is empty');
  const headers = rows.shift()!.map(value => value.replace(/^\uFEFF/, '').trim());
  const handleIndex = headers.indexOf('handle'), bioIndex = headers.indexOf('bio');
  if (handleIndex < 0 || bioIndex < 0) throw new Error('Bio CSV needs handle and bio columns');
  const result = rows.map(values => ({ handle: (values[handleIndex] ?? '').trim().replace(/^@/, '').toLowerCase(), bio: values[bioIndex] ?? '' }));
  if (result.some(value => !/^[a-z0-9_.]{3,30}$/.test(value.handle) || value.bio.length > 300)) throw new Error('Bio CSV has an invalid handle or a bio over 300 characters');
  if (new Set(result.map(value => value.handle)).size !== result.length) throw new Error('Bio CSV contains duplicate handles');
  return result;
}

function parseImages(files: FileList | null): ImageRow[] {
  const result = Array.from(files ?? []).map(file => {
    const name = file.name.toLowerCase();
    const handle = name.replace(/\.(jpe?g)$/i, '').replace(/^@/, '');
    if (!/\.jpe?g$/i.test(name)) throw new Error(`Unsupported file: ${file.name}`);
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) throw new Error(`Invalid avatar filename: ${file.name}`);
    if (file.type !== 'image/jpeg' || file.size < 4 || file.size > 3 * 1024 * 1024) throw new Error(`Avatar must be a JPEG up to 3 MB: ${file.name}`);
    return { handle, file };
  });
  if (new Set(result.map(value => value.handle)).size !== result.length) throw new Error('Avatar folder contains duplicate handles');
  return result;
}

async function lookup(handle: string): Promise<Target | null> {
  const response = await fetch(`/api/admin/v1/users/lookup?q=${encodeURIComponent(handle)}`, { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { users?: Target[]; error?: string };
  if (!response.ok) throw new Error(result.error ?? `Could not look up @${handle}`);
  return result.users?.find(user => user.handle.toLowerCase() === handle) ?? null;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function PersonaBulkRefresh() {
  const t = useT(), mutations = useRef(createMutationClient()), avatarKeys = useRef(new Map<string, string>());
  const completedBios = useRef(new Set<string>()), completedAvatars = useRef(new Set<string>());
  const [bioFile, setBioFile] = useState<File | null>(null), [avatarFiles, setAvatarFiles] = useState<FileList | null>(null);
  const [reason, setReason] = useState('Owner-approved persona bio and avatar refresh — 2026-11-05.');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [prepared, setPrepared] = useState<{ bios: BioRow[]; images: ImageRow[]; targets: Map<string, Target> } | null>(null);

  async function prepare() {
    setBusy(true); setMessage(''); setPrepared(null); setResults([]);
    completedBios.current.clear(); completedAvatars.current.clear(); avatarKeys.current.clear(); mutations.current.clear();
    try {
      if (!bioFile || !avatarFiles) throw new Error('Choose the bio CSV and all avatar JPEGs first');
      const bios = parseCsv(await bioFile.text()), images = parseImages(avatarFiles);
      if (bios.length !== 192 || images.length !== 192) throw new Error(`Expected 192 bios and 192 JPEGs; found ${bios.length} and ${images.length}`);
      const bioHandles = new Set(bios.map(item => item.handle)), imageHandles = new Set(images.map(item => item.handle));
      if (bioHandles.size !== imageHandles.size || [...bioHandles].some(handle => !imageHandles.has(handle))) throw new Error('Bio handles and avatar filenames do not match exactly');
      const handles = [...bioHandles], users: Array<Target | null> = [];
      for (let i = 0; i < handles.length; i += 8) users.push(...await Promise.all(handles.slice(i, i + 8).map(lookup)));
      const targets = new Map<string, Target>(), missing: string[] = [], unmanaged: string[] = [];
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i], user = users[i];
        if (!user) missing.push(handle); else if (!user.managed) unmanaged.push(handle); else targets.set(handle, user);
      }
      if (missing.length || unmanaged.length) throw new Error(`${missing.length} missing and ${unmanaged.length} non-managed profiles; no writes started`);
      setPrepared({ bios, images, targets }); setMessage(t('Preview ready: {count} managed profiles matched.', { count: bios.length }));
    } catch (error) { setMessage(t(mutationError(error))); }
    finally { setBusy(false); }
  }

  async function uploadAll() {
    if (!prepared || reason.trim().length < 8) return;
    setBusy(true); setMessage('');
    try {
      for (let start = 0; start < prepared.bios.length; start += 10) {
        const batch = prepared.bios.slice(start, start + 10).filter(row => !completedBios.current.has(row.handle));
        if (!batch.length) continue;
        const payload = { mode: 'update', reason, rows: batch.map(row => ({ luid: prepared.targets.get(row.handle)!.id, profile: { bio: row.bio } })) };
        const { response, result } = await mutations.current.post('/api/admin/v1/users/managed-profiles', payload);
        if (!response.ok) throw new Error(result.error ?? 'Bio batch failed; retry the same batch safely.');
        const rows = result.results as Array<{ luid: string; updated: boolean; error?: string }> | undefined;
        const failed = rows?.filter(row => !row.updated) ?? batch.map(() => ({ updated: false }));
        if (failed.length) throw new Error(`Bio batch failed for ${failed.length} profiles; avatar upload stopped.`);
        batch.forEach(row => completedBios.current.add(row.handle));
        mutations.current.clear('/api/admin/v1/users/managed-profiles', payload);
      }
      for (const image of prepared.images) {
        if (completedAvatars.current.has(image.handle)) continue;
        const target = prepared.targets.get(image.handle)!;
        let key = avatarKeys.current.get(image.handle);
        if (!key) { key = crypto.randomUUID(); avatarKeys.current.set(image.handle, key); }
        const form = new FormData(); form.set('file', image.file); form.set('reason', reason);
        const response = await fetch(`/api/admin/v1/users/${encodeURIComponent(target.id)}/avatar`, {
          method: 'POST', credentials: 'same-origin', headers: { 'idempotency-key': key }, body: form, signal: AbortSignal.timeout(120_000),
        });
        const result = await response.json().catch(() => ({})) as { status?: string; error?: string };
        if (!response.ok) throw new Error(`@${image.handle}: ${result.error ?? 'upload failed'}. Retry to resume.`);
        avatarKeys.current.delete(image.handle); completedAvatars.current.add(image.handle);
        setResults(current => [...current.filter(item => item.handle !== image.handle), { handle: image.handle, status: result.status ?? 'unknown' }]);
        if (completedAvatars.current.size < prepared.images.length) await wait(6_500);
      }
      setMessage(t('Bulk refresh finished. Check rejected and superseded avatars below.'));
    } catch (error) { setMessage(t(mutationError(error))); }
    finally { setBusy(false); }
  }

  return <section className="panel">
    <div className="panelHeader"><h2>{t('Bulk persona refresh')}</h2></div>
    <p className="muted">{t('Select persona-bios.csv and all 192 JPEGs from the avatars folder. Bios are saved in audited batches; photos use the normal Cloud Vision screening flow, one at a time.')}</p>
    <div className="decisionForm">
      <label>{t('Persona bio CSV')}<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { setBioFile(event.currentTarget.files?.[0] ?? null); setPrepared(null); }} /></label>
      <label>{t('Avatar JPEG files')}<input type="file" accept="image/jpeg,.jpg,.jpeg" multiple disabled={busy} onChange={event => { setAvatarFiles(event.currentTarget.files); setPrepared(null); }} /></label>
      <label>{t('Profile change reason')}<input value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={1000} disabled={busy} /></label>
      <button type="button" disabled={busy || !bioFile || !avatarFiles || reason.trim().length < 8} onClick={() => void prepare()}>{t('Match and preview')}</button>
      {prepared ? <p>{t('Ready: {bios} bios, {avatars} avatars.', { bios: prepared.bios.length, avatars: prepared.images.length })}</p> : null}
      {prepared ? <button type="button" disabled={busy} onClick={() => void uploadAll()}>{t('Upload all safely')}</button> : null}
      {busy && prepared ? <p role="status">{t('Uploading: {count} of {total} avatars completed.', { count: results.length, total: prepared.images.length })}</p> : null}
      {results.length ? <ul>{results.filter(item => item.status !== 'accepted_pending_human_review').map(item => <li key={item.handle}>@{item.handle}: {item.status}</li>)}</ul> : null}
      {message ? <output aria-live="polite">{message}</output> : null}
    </div>
  </section>;
}
