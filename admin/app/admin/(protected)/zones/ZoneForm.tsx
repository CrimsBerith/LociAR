'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

const CATEGORIES = ['school', 'hospital', 'worship', 'government', 'military', 'heritage', 'memorial', 'other'];

/** Adds a hard-block zone through the audited /api/admin/v1/zones endpoint. */
export default function ZoneForm() {
  const router = useRouter();
  const t = useT();
  const mutation = useRef(createMutationClient());
  const [form, setForm] = useState({ name: '', category: 'school', lat: '', lng: '', radius_meters: '150', reason: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const { response, result: payload } = await mutation.current.post('/api/admin/v1/zones',
        { ...form, lat: Number(form.lat), lng: Number(form.lng), radius_meters: Number(form.radius_meters) });
      if (!response.ok) throw new Error(payload.error ?? 'Zone could not be saved');
      setMessage(t('Zone saved. New posts inside it are blocked as soon as the zone is saved.'));
      mutation.current.clear();
      setForm({ ...form, name: '', lat: '', lng: '', reason: '' });
      router.refresh();
    } catch (error) {
      setMessage(t(mutationError(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={form.name} onChange={set('name')} placeholder={t('Name')} aria-label={t('Zone name')} />
      <select value={form.category} onChange={set('category')} aria-label={t('Category')}>
        {CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
      </select>
      <input value={form.lat} onChange={set('lat')} placeholder={t('Latitude')} aria-label={t('Latitude')} inputMode="decimal" />
      <input value={form.lng} onChange={set('lng')} placeholder={t('Longitude')} aria-label={t('Longitude')} inputMode="decimal" />
      <input value={form.radius_meters} onChange={set('radius_meters')} placeholder={t('Radius (m)')} aria-label={t('Radius in meters')} inputMode="numeric" />
      <input value={form.reason} onChange={set('reason')} placeholder={t('Reason (minimum 8 characters)')} aria-label={t('Reason')} />
      <div className="buttonRow">
        <button type="button" disabled={busy || form.reason.trim().length < 8 || !form.name || !form.lat || !form.lng} onClick={submit}>{t('Add zone')}</button>
      </div>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </div>
  );
}
