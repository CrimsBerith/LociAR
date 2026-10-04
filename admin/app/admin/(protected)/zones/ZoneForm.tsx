'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CATEGORIES = ['school', 'hospital', 'worship', 'government', 'military', 'heritage', 'memorial', 'other'];

/** Adds a hard-block zone through the audited /api/admin/v1/zones endpoint. */
export default function ZoneForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', category: 'school', lat: '', lng: '', radius_meters: '150', reason: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/v1/zones', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ ...form, lat: Number(form.lat), lng: Number(form.lng), radius_meters: Number(form.radius_meters) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Zone could not be saved');
      setMessage('Zone saved. New posts inside it are blocked within 5 minutes.');
      setForm({ ...form, name: '', lat: '', lng: '', reason: '' });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Zone could not be saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={form.name} onChange={set('name')} placeholder="Name" aria-label="Zone name" />
      <select value={form.category} onChange={set('category')} aria-label="Category">
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input value={form.lat} onChange={set('lat')} placeholder="Latitude" aria-label="Latitude" inputMode="decimal" />
      <input value={form.lng} onChange={set('lng')} placeholder="Longitude" aria-label="Longitude" inputMode="decimal" />
      <input value={form.radius_meters} onChange={set('radius_meters')} placeholder="Radius (m)" aria-label="Radius in meters" inputMode="numeric" />
      <input value={form.reason} onChange={set('reason')} placeholder="Reason (minimum 8 characters)" aria-label="Reason" />
      <div className="buttonRow">
        <button type="button" disabled={busy || form.reason.trim().length < 8 || !form.name || !form.lat || !form.lng} onClick={submit}>Add zone</button>
      </div>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </div>
  );
}
