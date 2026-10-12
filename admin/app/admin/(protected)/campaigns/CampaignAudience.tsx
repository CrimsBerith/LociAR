'use client';
import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
type Candidate = { luid: string; handle: string; distance: number; measuredAt: string; approvedPosts: number; bestLikes: number; arrivals: boolean; departures: boolean };

export default function CampaignAudience({ campaignId }: { campaignId: string }) {
  const [reason, setReason] = useState(''), [candidates, setCandidates] = useState<Candidate[]>([]), [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [notificationMode, setNotificationMode] = useState('immediate');
  const [title, setTitle] = useState('LociAR'), [text, setText] = useState(''), [departureRadius, setDepartureRadius] = useState(150);
  const mutation = useRef(createMutationClient());
  async function inspect(after?: string) {
    setBusy(true); setMessage(''); setCandidates([]);
    try {
      const response = await fetch('/api/admin/v1/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        cache: 'no-store', body: JSON.stringify({ action: 'audience', campaignId, reason, after }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Audience could not be read');
      const data = result.result as { candidates: Candidate[]; next: string | null };
      setCandidates(data.candidates); setNext(data.next);
      setMessage('This batch scans 25 location reports. Old, inaccurate or unconsented reports are excluded.');
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  async function notify(recipientId: string) {
    setBusy(true); setMessage('');
    try {
      const body = { action: 'notify', campaignId, recipientId, notificationMode, title: title.trim(), message: text.trim(),
        ...(notificationMode === 'departure' ? { departureRadius } : {}), reason };
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', body);
      if (!response.ok) throw new Error(result.error ?? 'Offer could not be assigned');
      setMessage(notificationMode === 'departure' ? 'Offer assigned. Departure from the user’s latest shared area can trigger the message after the phone synchronizes and observes the user inside. The origin expires within 24 hours.'
        : notificationMode === 'arrival' ? 'Offer assigned. The user’s device can notify on arrival after synchronizing while the app is open; location and notification permissions are required.'
        : notificationMode === 'map' ? 'Offer assigned on the map. No notification queued.'
        : 'Offer assigned and notification queued. Check delivery attempts below; queuing is not delivery.'); mutation.current.clear('/api/admin/v1/campaigns', body);
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <details><summary>Find nearby eligible users</summary>
    <label>Access and send reason<input value={reason} minLength={8} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
    <label>Offer delivery<select value={notificationMode} onChange={e => setNotificationMode(e.target.value)} disabled={busy}>
      <option value="map">Show on map only</option><option value="immediate">Notify now and show on map</option>
      <option value="arrival">Notify when entering the campaign area</option>
      <option value="departure">Notify when leaving the user’s current area</option>
    </select></label>
    <p>Arrival uses the campaign’s 2–5 m entry diameter. The larger OS radius only wakes the app; uncertain GPS suppresses notifications and cannot guarantee doorway entry.</p>
    {notificationMode !== 'map' ? <>
      <label>Notification title<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
      <label>Notification message (optional)<textarea value={text} maxLength={240} onChange={e => setText(e.target.value)} disabled={busy}
        placeholder="Kızılay AVM’de bugün sana özel indirim var." /></label>
      <p>Write in the recipient’s language. This text may appear on the lock screen. Blank uses the generic localized offer reminder.</p>
    </> : null}
    {notificationMode === 'departure' ? <>
      <label>Departure radius (m)<input type="number" min={100} max={500} value={departureRadius} onChange={e => setDepartureRadius(Number(e.target.value))} disabled={busy} /></label>
      <p>The origin is the user’s recent consented location at assignment, not the store. It is not labelled home. Departure requires enabled notifications and separate location sharing, and expires within 24 hours.</p>
    </> : null}
    <div className="buttonRow"><button disabled={busy || reason.trim().length < 8} onClick={() => inspect()}>Scan first batch</button>
      {next ? <button disabled={busy || reason.trim().length < 8} onClick={() => inspect(next)}>Scan next batch</button> : null}</div>
    {candidates.map(c => <article className="panel" key={c.luid}>
      <p>@{c.handle} · {c.luid}</p><p>{c.distance} m · Measured: {c.measuredAt}</p>
      <p>{c.approvedPosts} approved posts · Best genuine likes: {c.bestLikes}</p>
      <p>Arrival consent: {c.arrivals ? 'Enabled' : 'Not enabled'}</p>
      <p>Departure consent: {c.departures ? 'Enabled' : 'Not enabled'}</p>
      <button disabled={busy || reason.trim().length < 8 || (notificationMode === 'arrival' && !c.arrivals) || (notificationMode === 'departure' && !c.departures)} onClick={() => notify(c.luid)}>
        {notificationMode === 'departure' ? 'Assign and notify on departure' : notificationMode === 'arrival' ? 'Assign and notify on arrival' : notificationMode === 'map' ? 'Assign map offer' : 'Assign offer and notify this user'}</button>
    </article>)}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
