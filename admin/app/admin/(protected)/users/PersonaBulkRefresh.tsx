'use client';

import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { parseCsvRows } from '../../../../lib/csv';
import { useT } from '../../I18nProvider';

type BioRow = { handle: string; bio: string };
type Target = { id: string; handle: string; managed: boolean };
type ImageRow = { handle: string; file: File };
type Result = { handle: string; status: string };
type Prepared = { bios: BioRow[]; images: ImageRow[]; targets: Map<string, Target> };
type MutationClient = ReturnType<typeof createMutationClient>;

const EXPECTED_PERSONAS = 192;
const HANDLE = /^[a-z0-9_.]{3,30}$/;
const BIO_BATCH = 10;
const LOOKUP_BATCH = 8;
const AVATAR_PAUSE_MS = 6_500;

function parseBioCsv(text: string): BioRow[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error('Bio CSV is empty');
  const headers = rows.shift()!.map(value => value.replace(/^﻿/, '').trim());
  const handleIndex = headers.indexOf('handle'), bioIndex = headers.indexOf('bio');
  if (handleIndex < 0 || bioIndex < 0) throw new Error('Bio CSV needs handle and bio columns');
  const result = rows.map(values => ({ handle: (values[handleIndex] ?? '').trim().replace(/^@/, '').toLowerCase(), bio: values[bioIndex] ?? '' }));
  if (result.some(value => !HANDLE.test(value.handle) || value.bio.length > 300)) throw new Error('Bio CSV has an invalid handle or a bio over 300 characters');
  if (new Set(result.map(value => value.handle)).size !== result.length) throw new Error('Bio CSV contains duplicate handles');
  return result;
}

function parseImages(files: FileList | null): ImageRow[] {
  const result = Array.from(files ?? []).map(file => {
    const name = file.name.toLowerCase();
    const handle = name.replace(/\.(jpe?g)$/i, '').replace(/^@/, '');
    if (!/\.jpe?g$/i.test(name)) throw new Error(`Unsupported file: ${file.name}`);
    if (!HANDLE.test(handle)) throw new Error(`Invalid avatar filename: ${file.name}`);
    if (file.type !== 'image/jpeg' || file.size < 4 || file.size > 3 * 1024 * 1024) throw new Error(`Avatar must be a JPEG up to 3 MB: ${file.name}`);
    return { handle, file };
  });
  if (new Set(result.map(value => value.handle)).size !== result.length) throw new Error('Avatar folder contains duplicate handles');
  return result;
}

function matchingHandles(bios: BioRow[], images: ImageRow[]): string[] {
  if (bios.length !== EXPECTED_PERSONAS || images.length !== EXPECTED_PERSONAS) {
    throw new Error(`Expected ${EXPECTED_PERSONAS} bios and ${EXPECTED_PERSONAS} JPEGs; found ${bios.length} and ${images.length}`);
  }
  const bioHandles = new Set(bios.map(item => item.handle)), imageHandles = new Set(images.map(item => item.handle));
  if (bioHandles.size !== imageHandles.size || [...bioHandles].some(handle => !imageHandles.has(handle))) {
    throw new Error('Bio handles and avatar filenames do not match exactly');
  }
  return [...bioHandles];
}

async function lookup(handle: string): Promise<Target | null> {
  const response = await fetch(`/api/admin/v1/users/lookup?q=${encodeURIComponent(handle)}`, { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { users?: Target[]; error?: string };
  if (!response.ok) throw new Error(result.error ?? `Could not look up @${handle}`);
  return result.users?.find(user => user.handle.toLowerCase() === handle) ?? null;
}

/** Looks handles up in small parallel groups so the admin API is never flooded. */
async function lookupAll(handles: string[]): Promise<Array<Target | null>> {
  const groups: string[][] = [];
  for (let i = 0; i < handles.length; i += LOOKUP_BATCH) groups.push(handles.slice(i, i + LOOKUP_BATCH));
  const users: Array<Target | null> = [];
  for (const group of groups) users.push(...await Promise.all(group.map(lookup))); // NOSONAR: groups run in sequence on purpose (rate limit).
  return users;
}

/** Every handle must resolve to an admin-managed profile before any write starts. */
async function resolveTargets(handles: string[]): Promise<Map<string, Target>> {
  const users = await lookupAll(handles);
  const targets = new Map<string, Target>(), missing: string[] = [], unmanaged: string[] = [];
  handles.forEach((handle, index) => {
    const user = users[index];
    if (!user) missing.push(handle);
    else if (user.managed) targets.set(handle, user);
    else unmanaged.push(handle);
  });
  if (missing.length || unmanaged.length) throw new Error(`${missing.length} missing and ${unmanaged.length} non-managed profiles; no writes started`);
  return targets;
}

async function uploadBioBatch(mutations: MutationClient, prepared: Prepared, batch: BioRow[], reason: string): Promise<void> {
  const payload = { mode: 'update', reason, rows: batch.map(row => ({ luid: prepared.targets.get(row.handle)!.id, profile: { bio: row.bio } })) };
  const { response, result } = await mutations.post('/api/admin/v1/users/managed-profiles', payload);
  if (!response.ok) throw new Error(result.error ?? 'Bio batch failed; retry the same batch safely.');
  const rows = result.results as Array<{ luid: string; updated: boolean; error?: string }> | undefined;
  const failed = rows?.filter(row => !row.updated) ?? batch;
  if (failed.length) throw new Error(`Bio batch failed for ${failed.length} profiles; avatar upload stopped.`);
  mutations.clear('/api/admin/v1/users/managed-profiles', payload);
}

async function uploadAvatar(image: ImageRow, target: Target, reason: string, key: string): Promise<string> {
  const form = new FormData(); form.set('file', image.file); form.set('reason', reason);
  const response = await fetch(`/api/admin/v1/users/${encodeURIComponent(target.id)}/avatar`, {
    method: 'POST', credentials: 'same-origin', headers: { 'idempotency-key': key }, body: form, signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json().catch(() => ({})) as { status?: string; error?: string };
  if (!response.ok) throw new Error(`@${image.handle}: ${result.error ?? 'upload failed'}. Retry to resume.`);
  return result.status ?? 'unknown';
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function PersonaBulkRefresh() {
  const t = useT(), mutations = useRef(createMutationClient()), avatarKeys = useRef(new Map<string, string>());
  const completedBios = useRef(new Set<string>()), completedAvatars = useRef(new Set<string>());
  const [bioFile, setBioFile] = useState<File | null>(null), [avatarFiles, setAvatarFiles] = useState<FileList | null>(null);
  const [reason, setReason] = useState('Owner-approved persona bio and avatar refresh — 2026-11-05.');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  async function prepare() {
    setBusy(true); setMessage(''); setPrepared(null); setResults([]);
    completedBios.current.clear(); completedAvatars.current.clear(); avatarKeys.current.clear(); mutations.current.clear();
    try {
      if (!bioFile || !avatarFiles) throw new Error('Choose the bio CSV and all avatar JPEGs first');
      const bios = parseBioCsv(await bioFile.text()), images = parseImages(avatarFiles);
      const targets = await resolveTargets(matchingHandles(bios, images));
      setPrepared({ bios, images, targets }); setMessage(t('Preview ready: {count} managed profiles matched.', { count: bios.length }));
    } catch (error) { setMessage(t(mutationError(error))); }
    finally { setBusy(false); }
  }

  /** Bio batches first; a retry skips batches that already succeeded. */
  async function uploadBios(ready: Prepared) {
    for (let start = 0; start < ready.bios.length; start += BIO_BATCH) {
      const batch = ready.bios.slice(start, start + BIO_BATCH).filter(row => !completedBios.current.has(row.handle));
      if (!batch.length) continue;
      await uploadBioBatch(mutations.current, ready, batch, reason); // NOSONAR: batches are sequential so a failure stops later writes.
      batch.forEach(row => completedBios.current.add(row.handle));
    }
  }

  /** Avatars one at a time through Cloud Vision screening; the idempotency key survives a retry. */
  async function uploadAvatars(ready: Prepared) {
    for (const image of ready.images.filter(item => !completedAvatars.current.has(item.handle))) {
      const key = avatarKeys.current.get(image.handle) ?? crypto.randomUUID();
      avatarKeys.current.set(image.handle, key);
      const status = await uploadAvatar(image, ready.targets.get(image.handle)!, reason, key); // NOSONAR: one upload at a time (screening rate limit).
      avatarKeys.current.delete(image.handle); completedAvatars.current.add(image.handle);
      setResults(current => [...current.filter(item => item.handle !== image.handle), { handle: image.handle, status }]);
      if (completedAvatars.current.size < ready.images.length) await wait(AVATAR_PAUSE_MS); // NOSONAR: deliberate pause between uploads.
    }
  }

  async function uploadAll() {
    if (!prepared || reason.trim().length < 8) return;
    setBusy(true); setMessage('');
    try {
      await uploadBios(prepared);
      await uploadAvatars(prepared);
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
      {busy && prepared ? <output>{t('Uploading: {count} of {total} avatars completed.', { count: results.length, total: prepared.images.length })}</output> : null}
      {results.length ? <ul>{results.filter(item => item.status !== 'accepted_pending_human_review').map(item => <li key={item.handle}>@{item.handle}: {item.status}</li>)}</ul> : null}
      {message ? <output aria-live="polite">{message}</output> : null}
    </div>
  </section>;
}
