'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

export default function BusinessEditor({ venue }: { venue: { id: string; name: string; lat: number; lng: number; status: string; diameter: number } }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), mutation = useRef(createMutationClient()), router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = { action: 'update', id: venue.id, name: String(form.get('name')), lat: Number(form.get('lat')), lng: Number(form.get('lng')),
      diameter: Number(form.get('diameter')), status: String(form.get('status')), reason: String(form.get('reason')) };
    setBusy(true); setMessage('');
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/businesses', body);
      if (!response.ok) throw new Error(result.error ?? 'Could not save business');
      mutation.current.clear('/api/admin/v1/businesses', body); setMessage('Saved. A name, location or status change invalidates older notes immediately. Revalidation needs a new content review.'); router.refresh();
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <details><summary>Edit business / closure / relocation</summary><form onSubmit={submit} className="decisionForm">
    <label>Business name<input name="name" defaultValue={venue.name} required maxLength={120}/></label>
    <label>Entrance latitude<input name="lat" type="number" step="any" min={-90} max={90} defaultValue={venue.lat} required/></label>
    <label>Entrance longitude<input name="lng" type="number" step="any" min={-180} max={180} defaultValue={venue.lng} required/></label>
    <label>Status<select name="status" defaultValue={venue.status}><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option><option value="moved">Moved</option></select></label>
    <label>Notification diameter (m)<input name="diameter" type="number" min={2} max={5} step="0.5" defaultValue={venue.diameter} required/></label>
    <p>Diameter is the full width; 5 m means a 2.5 m radius. GPS must locate the device and its reported uncertainty entirely inside. Indoor GPS can miss this target; this is not guaranteed doorway detection. The larger OS region only wakes the app.</p>
    <label>Reason<input name="reason" required minLength={8} maxLength={1000}/></label><button disabled={busy}>Save business</button>
  </form>{message ? <p role="status">{message}</p> : null}</details>;
}
