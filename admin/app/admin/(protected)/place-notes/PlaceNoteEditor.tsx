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

export function LikeThresholdForm({ threshold }: { threshold: number }) {
  const { busy, message, send } = useSubmit('Threshold saved.');
  return <form className="decisionForm" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget);
    void send({ action: 'settings', likeThreshold: Number(f.get('threshold')), reason: String(f.get('reason')) }); }}>
    <label>Likes needed to become a notification candidate<input name="threshold" type="number" min={1} max={1000} step={1} defaultValue={threshold} required/></label>
    <label>Reason<input name="reason" required minLength={8} maxLength={1000}/></label><button disabled={busy}>Save threshold</button>
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
