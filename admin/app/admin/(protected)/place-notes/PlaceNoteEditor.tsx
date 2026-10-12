'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

const ENDPOINT = '/api/admin/v1/place-notes';

function useSubmit(success: string) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), mutation = useRef(createMutationClient()), router = useRouter();
  async function send(body: Record<string, unknown>) {
    setBusy(true); setMessage('');
    try {
      const { response, result } = await mutation.current.post(ENDPOINT, body);
      if (!response.ok) throw new Error(result.error ?? 'Could not save');
      mutation.current.clear(ENDPOINT, body); setMessage(success); router.refresh();
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return { busy, message, send };
}

/** Notification radius and optional end date for one note. */
export function PlaceNoteEditor({ id, radius, endsAt, canEditRadius, canEditEnd }: { id: string; radius: number; endsAt: string | null; canEditRadius: boolean; canEditEnd: boolean }) {
  const { busy, message, send } = useSubmit('Saved and audited.');
  return <details><summary>Radius {radius} m{endsAt ? ` · ends ${endsAt}` : ' · no end date'}</summary>
    {canEditRadius ? <form className="decisionForm" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget);
      void send({ action: 'set_radius', id, radius: Number(f.get('radius')), reason: String(f.get('reason')) }); }}>
      <label>Notification radius (m)<input name="radius" type="number" min={15} max={100} step={1} defaultValue={radius} required/></label>
      <p className="muted">Phone GPS is usually 5–30 m off. A visitor is notified when their uncertainty circle touches this circle. Use 15–25 m outdoors, 30–60 m indoors, up to 100 m for large venues.</p>
      <label>Reason<input name="reason" required minLength={8} maxLength={1000}/></label><button disabled={busy}>Save radius</button>
    </form> : null}
    {canEditEnd ? <form className="decisionForm" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget);
      const value = String(f.get('endsAt') ?? ''); void send({ action: 'set_end', id, endsAt: value ? new Date(value).toISOString() : null, reason: String(f.get('reason')) }); }}>
      <label>End date (optional)<input name="endsAt" type="datetime-local" defaultValue={endsAt ? endsAt.slice(0, 16) : ''}/></label>
      <p className="muted">Notes never expire on their own. At this time the note is removed like a moderator soft delete. Leave empty to clear.</p>
      <label>Reason<input name="reason" required minLength={8} maxLength={1000}/></label><button disabled={busy}>Save end date</button>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

export function LikeThresholdForm({ threshold, denseThreshold, unlockRadius, reportThreshold }: { threshold: number; denseThreshold: number; unlockRadius: number; reportThreshold: number }) {
  const { busy, message, send } = useSubmit('Settings saved.');
  return <form className="decisionForm" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget);
    void send({ action: 'settings', likeThreshold: Number(f.get('threshold')), denseThreshold: Number(f.get('dense')), unlockRadius: Number(f.get('unlock')), reportThreshold: Number(f.get('report')), reason: String(f.get('reason')) }); }}>
    <label>Likes from accounts older than a day that send a note as a notification (automatic)<input name="threshold" type="number" min={1} max={1000} step={1} defaultValue={threshold} required/></label>
    <label>Notes in one spot (notes within ~25 m, at most 40 m wide) that make it a dense spot<input name="dense" type="number" min={5} max={1000} step={1} defaultValue={denseThreshold} required/></label>
    <label>Reports from different users that hide a note<input name="report" type="number" min={1} max={100} step={1} defaultValue={reportThreshold} required/></label>
    <label>Dense-spot notes open within (m)<input name="unlock" type="number" min={2} max={50} step={1} defaultValue={unlockRadius} required/></label>
    <p className="muted">Dense-spot text is hidden until a visitor is this close (GPS error may add at most 5 m); the map still shows the count, and visitors get one text-free “many notes here” alert per 30 days. 2–5 m is reliable only with the AR camera outdoors (Google Geospatial); phone GPS alone needs about 15 m.</p>
    <label>Reason<input name="reason" required minLength={8} maxLength={1000}/></label><button disabled={busy}>Save threshold</button>
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
