'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import MapPicker from '../MapPicker';

export default function CampaignForms({ brands, canBrand }: { brands: Array<{ id: string; name: string }>; canBrand: boolean }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [spot, setSpot] = useState({ lat: 41.0082, lng: 28.9784 }), [radius, setRadius] = useState(1000), [entry, setEntry] = useState(30);
  const mutation = useRef(createMutationClient()), router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), body: Record<string, unknown> = { action };
    for (const [key, value] of data) body[key] = ['lat', 'lng', 'radius', 'arrivalRadius', 'entryRadius', 'audienceMaxAgeMinutes', 'minPosts', 'minLikes'].includes(key) ? Number(value) : String(value);
    for (const date of ['startsAt', 'endsAt']) if (body[date]) body[date] = new Date(String(body[date])).toISOString();
    setBusy(true); setMessage('');
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', body);
      if (!response.ok) throw new Error(result.error ?? 'Could not save');
      setMessage('Saved. Campaigns remain drafts until approved.'); mutation.current.clear('/api/admin/v1/campaigns', body); form.reset(); router.refresh();
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <>
    {canBrand ? <details className="panel"><summary>Register or pause a brand</summary><form onSubmit={e => submit(e, 'brand')} className="decisionForm">
      <label>Brand ID to update (blank for new)<input name="brandId" /></label>
      <label>Brand name<input name="name" required maxLength={80} /></label>
      <label>Public brand profile UUID<input name="authorId" required placeholder="Create a managed identity in Users first" /></label>
      <label>Editor account UUID (optional)<input name="memberId" placeholder="Future verified brand account; no admin role is granted" /></label>
      <label>Editor membership<select name="memberState"><option value="active">Grant editor</option><option value="revoked">Revoke editor</option></select></label>
      <label>Status<select name="status"><option value="active">Active</option><option value="paused">Paused</option></select></label>
      <label>Reason<input name="reason" required minLength={8} maxLength={1000} /></label>
      <button disabled={busy}>Save brand</button>
    </form></details> : null}
    <details className="panel"><summary>Create discount campaign</summary><form onSubmit={e => submit(e, 'create')} className="decisionForm">
      <label>Brand<select name="brandId" required>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Internal campaign name<input name="name" required maxLength={80} /></label>
      <label>Message<textarea name="message" required maxLength={1000} placeholder="Text only. No links, photos or video." /></label>
      <label>Discount code and terms<textarea name="terms" required maxLength={800} placeholder="For example: 20% off with code LOCI20 at this branch. Exclusions and end date." /></label>
      <label>Latitude<input name="lat" type="number" step="any" required min={-90} max={90} value={spot.lat} onChange={e => setSpot(s => ({ ...s, lat: Number(e.target.value) }))} /></label>
      <label>Longitude<input name="lng" type="number" step="any" required min={-180} max={180} value={spot.lng} onChange={e => setSpot(s => ({ ...s, lng: Number(e.target.value) }))} /></label>
      <MapPicker label="Campaign location map" center={spot} zoom={15} onPick={setSpot}
        shapes={[{ kind: 'circle', ...spot, radius, color: '#64748b', dashed: true }, { kind: 'circle', ...spot, radius: entry }]}
        hint="Click the map to set the campaign location. Dashed: nearby audience radius; solid: entry radius." />
      <label>Nearby audience radius (m)<input name="radius" type="number" required value={radius} onChange={e => setRadius(Number(e.target.value))} min={100} max={5000} /></label>
      <label>OS wake-up radius (m)<input name="arrivalRadius" type="number" required defaultValue={150} min={100} max={500} /></label>
      <label>Entry radius for arrival reminders (m)<input name="entryRadius" type="number" required value={entry} onChange={e => setEntry(Number(e.target.value))} min={15} max={100} step={1}/></label>
      <p className="muted">Phone GPS is usually 5–30 m off. Someone walking or driving past within about this radius (plus their GPS error, at most 20 m) gets the reminder once. 30 m suits a shop front; use more for large venues.</p>
      <label>Use users&apos; last shared location up to (minutes old)<input name="audienceMaxAgeMinutes" type="number" required defaultValue={1440} min={2} max={1440} step={1}/></label>
      <p className="muted">1440 = last 24 hours, so people whose last shared location (often near home or work) is in the audience radius can be assigned an arrival reminder for when they pass by later. Use 2 for people who are nearby right now.</p>
      <label>Minimum approved posts in latest 100<input name="minPosts" type="number" required defaultValue={1} min={0} max={100} /></label>
      <label>Minimum genuine likes on one of those posts<input name="minLikes" type="number" required defaultValue={10} min={0} max={1000000} /></label>
      <label>Start (your local time)<input name="startsAt" type="datetime-local" required /></label>
      <label>End (your local time)<input name="endsAt" type="datetime-local" required /></label>
      <label>Reason<input name="reason" required minLength={8} maxLength={1000} /></label>
      <button disabled={busy || !brands.length}>Save draft</button>
    </form></details>
    {message ? <p role="status">{message}</p> : null}
  </>;
}
