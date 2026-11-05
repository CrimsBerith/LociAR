'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

export default function ManagedProfileEditor({ luid, displayName: initialDisplayName, bio: initialBio }: {
  luid: string; displayName: string; bio: string;
}) {
  const t = useT(), router = useRouter(), mutation = useRef(createMutationClient());
  const photoKey = useRef('');
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [photo, setPhoto] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { mode: 'update', reason, rows: [{ luid, profile: { displayName, bio } }] };
      const { response, result } = await mutation.current.post('/api/admin/v1/users/managed-profiles', payload);
      if (!response.ok) throw new Error(result.error ?? t('Profile update failed.'));
      const row = (result.results as Array<{ updated: boolean; error?: string }> | undefined)?.[0];
      if (!row?.updated) throw new Error(row?.error ?? t('Profile update failed.'));
      mutation.current.clear(); setMessage(t('Managed profile saved and audited.')); router.refresh();
    } catch (error) { setMessage(t(mutationError(error))); }
    finally { setBusy(false); }
  }

  async function uploadPhoto() {
    if (!photo) return;
    setBusy(true); setMessage('');
    try {
      if (!photoKey.current) photoKey.current = crypto.randomUUID();
      const form = new FormData(); form.set('file', photo); form.set('reason', reason);
      const response = await fetch(`/api/admin/v1/users/${encodeURIComponent(luid)}/avatar`, {
        method: 'POST', credentials: 'same-origin', headers: { 'idempotency-key': photoKey.current }, body: form,
        signal: AbortSignal.timeout(120_000),
      });
      const result = await response.json().catch(() => ({})) as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? t('Photo upload failed. Retry the same file.'));
      photoKey.current = ''; setPhoto(null);
      if (result.status === 'rejected') setMessage(t('The photo did not pass safety screening.'));
      else if (result.status === 'superseded') setMessage(t('A newer photo upload replaced this one.'));
      else setMessage(t('Photo uploaded and passed automated safety screening.'));
      router.refresh();
    } catch (error) { setMessage(t(mutationError(error))); }
    finally { setBusy(false); }
  }

  const ready = !busy && reason.trim().length >= 8;
  return <div className="decisionForm">
    <form onSubmit={saveProfile} className="metricForm">
      <label>{t('Display name')}<input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={60} /></label>
      <label>{t('Bio')}<textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={300} rows={3} /></label>
      <label>{t('Profile change reason')}<input value={reason} onChange={event => setReason(event.target.value)} required minLength={8} maxLength={1000} /></label>
      <button type="submit" disabled={!ready}>{t('Save managed profile')}</button>
    </form>
    <label>{t('JPEG profile photo (3 MB maximum)')}<input type="file" accept="image/jpeg,.jpg,.jpeg" onChange={event => { setPhoto(event.currentTarget.files?.[0] ?? null); photoKey.current = ''; }} /></label>
    <button type="button" disabled={!ready || !photo} onClick={() => void uploadPhoto()}>{t('Upload profile photo')}</button>
    {message ? <output aria-live="polite">{t(message)}</output> : null}
  </div>;
}
