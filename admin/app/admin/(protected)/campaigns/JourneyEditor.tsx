'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

type Step = {
  id: string; trigger: 'leave_usual_place' | 'enter' | 'dwell' | 'exit';
  zoneKind: 'circle' | 'street'; lat: number; lng: number; radius: number; streetPoints: string; width: number;
  dwellSeconds: number; requires: string; withinMinutes: number;
  scheduled: boolean; days: number[]; start: string; end: string;
  push: boolean; map: boolean; ar: boolean; title: string; message: string;
  codeKind: 'none' | 'shared' | 'unique'; codeValue: string; codePrefix: string;
  frequency: 'once' | 'daily' | 'hours'; hours: number; budget: string;
};
type Saved = Record<string, any>;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TRIGGER_LABELS: Record<Step['trigger'], string> = {
  leave_usual_place: 'Leaves their usual place (learned on the phone, never sent to us)',
  enter: 'Enters the zone (walking or driving past counts)',
  dwell: 'Stays in the zone for a while',
  exit: 'Leaves the zone',
};

function blank(index: number, lat: number, lng: number): Step {
  return { id: `s${index + 1}`, trigger: index === 0 ? 'leave_usual_place' : 'enter', zoneKind: 'circle', lat, lng, radius: 30, streetPoints: '', width: 20,
    dwellSeconds: 120, requires: index ? `s${index}` : '', withinMinutes: 360, scheduled: false, days: [1, 2, 3, 4, 5, 6, 0], start: '18:00', end: '23:00',
    push: true, map: index > 0, ar: index > 0, title: '', message: '', codeKind: 'none', codeValue: '', codePrefix: 'LOCI',
    frequency: 'once', hours: 24, budget: '' };
}

function fromSaved(s: Saved, lat: number, lng: number): Step {
  const base = blank(0, lat, lng);
  return { ...base, id: s.id, trigger: s.trigger, zoneKind: s.zone?.kind ?? 'circle', lat: s.zone?.lat ?? lat, lng: s.zone?.lng ?? lng, radius: s.zone?.radius ?? 30,
    streetPoints: (s.zone?.points ?? []).map((p: { lat: number; lng: number }) => `${p.lat}, ${p.lng}`).join('\n'), width: s.zone?.width ?? 20,
    dwellSeconds: s.dwellSeconds ?? 120, requires: s.requires ?? '', withinMinutes: s.withinMinutes ?? 360,
    scheduled: !!s.schedule, days: s.schedule?.days ?? base.days, start: s.schedule?.start ?? base.start, end: s.schedule?.end ?? base.end,
    push: s.channels?.push ?? true, map: !!s.channels?.map, ar: !!s.channels?.ar, title: s.title ?? '', message: s.message ?? '',
    codeKind: s.code?.kind ?? 'none', codeValue: s.code?.value ?? '', codePrefix: s.code?.prefix ?? 'LOCI',
    frequency: s.frequency?.kind ?? 'once', hours: s.frequency?.hours ?? 24, budget: s.budget != null ? String(s.budget) : '' };
}

function toPayload(s: Step) {
  const points = s.streetPoints.split('\n').map(line => line.split(',').map(v => Number(v.trim()))).filter(p => p.length === 2 && p.every(Number.isFinite))
    .map(([lat, lng]) => ({ lat, lng }));
  return { id: s.id, trigger: s.trigger,
    ...(s.trigger !== 'leave_usual_place' ? { zone: s.zoneKind === 'circle' ? { kind: 'circle', lat: s.lat, lng: s.lng, radius: s.radius } : { kind: 'street', points, width: s.width } } : {}),
    ...(s.trigger === 'dwell' ? { dwellSeconds: s.dwellSeconds } : {}),
    ...(s.requires ? { requires: s.requires, withinMinutes: s.withinMinutes } : {}),
    ...(s.scheduled ? { schedule: { days: s.days, start: s.start, end: s.end } } : {}),
    channels: { push: s.push, map: s.map, ar: s.ar }, title: s.title, message: s.message,
    code: s.codeKind === 'shared' ? { kind: 'shared', value: s.codeValue } : s.codeKind === 'unique' ? { kind: 'unique', prefix: s.codePrefix } : { kind: 'none' },
    frequency: s.frequency === 'hours' ? { kind: 'hours', hours: s.hours } : { kind: s.frequency }, ...(s.budget ? { budget: Number(s.budget) } : {}) };
}

/**
 * Zone-campaign steps: who gets what, where and when. Example: step 1 "leaves usual place" →
 * "Party in Moda tonight"; step 2 "enters the party street", requires step 1 → unique beer code.
 */
export default function JourneyEditor({ campaignId, lat, lng, saved, timezone }: { campaignId: string; lat: number; lng: number; saved: Saved[]; timezone: string }) {
  const [steps, setSteps] = useState<Step[]>(saved.length ? saved.map(s => fromSaved(s, lat, lng)) : [blank(0, lat, lng)]);
  const [tz, setTz] = useState(timezone), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const mutation = useRef(createMutationClient()), router = useRouter();
  const update = (i: number, patch: Partial<Step>) => setSteps(old => old.map((s, j) => j === i ? { ...s, ...patch } : s));
  async function save() {
    setBusy(true); setMessage('');
    const body = { action: 'steps', campaignId, timezone: tz, steps: steps.map(toPayload), reason };
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', body);
      if (!response.ok) throw new Error(result.error ?? 'Could not save steps');
      mutation.current.clear('/api/admin/v1/campaigns', body); setMessage('Steps saved. Active campaigns reach phones in the area within minutes.'); router.refresh();
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <details className="panel"><summary>Zone campaign steps ({steps.length})</summary><div className="decisionForm">
    <p className="muted">Everyone who turned on Notifications and is near the campaign can trigger these steps; you do not pick recipients. Phones learn their usual place (where they spend nights) on the device only; the campaign area below decides who gets a “leaves usual place” step. GPS is usually 5–30 m off, so zones smaller than 15–20 m are unreliable.</p>
    <label>Time zone for schedules<input value={tz} onChange={e => setTz(e.target.value)} maxLength={64}/></label>
    {steps.map((s, i) => <fieldset key={i}><legend>Step {i + 1} · {s.id}</legend>
      <label>When<select value={s.trigger} onChange={e => update(i, { trigger: e.target.value as Step['trigger'] })}>
        {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {s.trigger !== 'leave_usual_place' ? <>
        <label>Zone<select value={s.zoneKind} onChange={e => update(i, { zoneKind: e.target.value as Step['zoneKind'] })}><option value="circle">Circle</option><option value="street">Street (line + width)</option></select></label>
        {s.zoneKind === 'circle' ? <div className="metricForm">
          <label>Latitude<input type="number" step="any" value={s.lat} onChange={e => update(i, { lat: Number(e.target.value) })}/></label>
          <label>Longitude<input type="number" step="any" value={s.lng} onChange={e => update(i, { lng: Number(e.target.value) })}/></label>
          <label>Radius (m)<input type="number" min={15} max={2000} value={s.radius} onChange={e => update(i, { radius: Number(e.target.value) })}/></label>
        </div> : <>
          <label>Street points, one “latitude, longitude” per line (2–20)<textarea value={s.streetPoints} onChange={e => update(i, { streetPoints: e.target.value })} rows={4}/></label>
          <label>Street width (m)<input type="number" min={10} max={200} value={s.width} onChange={e => update(i, { width: Number(e.target.value) })}/></label>
        </>}
        <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=18/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer">Check on the map ↗</a>
      </> : <p className="muted">Fires when someone whose usual place lies inside the campaign area leaves it, within about 150 m and usually 1–3 minutes.</p>}
      {s.trigger === 'dwell' ? <label>Stay at least (seconds)<input type="number" min={10} max={1800} value={s.dwellSeconds} onChange={e => update(i, { dwellSeconds: Number(e.target.value) })}/></label> : null}
      <label>Only after step<select value={s.requires} onChange={e => update(i, { requires: e.target.value })}><option value="">— no earlier step needed —</option>
        {steps.filter((_, j) => j !== i).map(o => <option key={o.id} value={o.id}>{o.id}</option>)}</select></label>
      {s.requires ? <label>…received within (minutes)<input type="number" min={5} max={10080} value={s.withinMinutes} onChange={e => update(i, { withinMinutes: Number(e.target.value) })}/></label> : null}
      <label><input type="checkbox" checked={s.scheduled} onChange={e => update(i, { scheduled: e.target.checked })}/> Only on certain days and hours</label>
      {s.scheduled ? <div className="metricForm">
        {DAYS.map((d, n) => <label key={d}><input type="checkbox" checked={s.days.includes(n)} onChange={e => update(i, { days: e.target.checked ? [...s.days, n] : s.days.filter(x => x !== n) })}/> {d}</label>)}
        <label>From<input type="time" value={s.start} onChange={e => update(i, { start: e.target.value })}/></label>
        <label>Until<input type="time" value={s.end} onChange={e => update(i, { end: e.target.value })}/></label>
      </div> : null}
      <label>Title<input value={s.title} onChange={e => update(i, { title: e.target.value })} maxLength={80} required/></label>
      <label>Message<textarea value={s.message} onChange={e => update(i, { message: e.target.value })} maxLength={240} required/></label>
      <div className="metricForm">
        <label><input type="checkbox" checked={s.push} onChange={e => update(i, { push: e.target.checked })}/> Notification</label>
        <label><input type="checkbox" checked={s.map} onChange={e => update(i, { map: e.target.checked })}/> Note on the map</label>
        <label><input type="checkbox" checked={s.ar} onChange={e => update(i, { ar: e.target.checked })}/> Note in AR</label>
      </div>
      <label>Code<select value={s.codeKind} onChange={e => update(i, { codeKind: e.target.value as Step['codeKind'] })}><option value="none">No code</option><option value="shared">Same code for everyone</option><option value="unique">Unique code per person</option></select></label>
      {s.codeKind === 'shared' ? <label>Code<input value={s.codeValue} onChange={e => update(i, { codeValue: e.target.value })} maxLength={40}/></label> : null}
      {s.codeKind === 'unique' ? <label>Code prefix<input value={s.codePrefix} onChange={e => update(i, { codePrefix: e.target.value })} maxLength={10}/></label> : null}
      <label>How often per person<select value={s.frequency} onChange={e => update(i, { frequency: e.target.value as Step['frequency'] })}><option value="once">Once</option><option value="daily">Once a day</option><option value="hours">Every N hours</option></select></label>
      {s.frequency === 'hours' ? <label>Hours<input type="number" min={1} max={720} value={s.hours} onChange={e => update(i, { hours: Number(e.target.value) })}/></label> : null}
      <label>Total limit (optional, e.g. first 300 people)<input type="number" min={1} value={s.budget} onChange={e => update(i, { budget: e.target.value })}/></label>
      {steps.length > 1 ? <button type="button" className="secondaryButton" onClick={() => setSteps(old => old.filter((_, j) => j !== i))}>Remove step</button> : null}
    </fieldset>)}
    {steps.length < 5 ? <button type="button" className="secondaryButton" onClick={() => setSteps(old => [...old, blank(old.length, lat, lng)])}>Add step</button> : null}
    <label>Reason<input value={reason} onChange={e => setReason(e.target.value)} minLength={8} maxLength={1000}/></label>
    <button type="button" disabled={busy || reason.trim().length < 8} onClick={save}>Save steps</button>
    {message ? <p role="status">{message}</p> : null}
  </div></details>;
}

export function CodeRedeemForm() {
  const [code, setCode] = useState(''), [reason, setReason] = useState('Redeemed at the counter'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const mutation = useRef(createMutationClient()), router = useRouter();
  async function redeem() {
    setBusy(true); setMessage('');
    const body = { action: 'redeem', code, reason };
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', body);
      if (!response.ok) throw new Error(result.error ?? 'Could not redeem');
      mutation.current.clear('/api/admin/v1/campaigns', body); setMessage(`Redeemed ${code}.`); setCode(''); router.refresh();
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <section className="panel"><h2>Redeem a code</h2><div className="decisionForm">
    <label>Code<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="BEER-7F3K9Q" maxLength={40}/></label>
    <label>Reason<input value={reason} onChange={e => setReason(e.target.value)} minLength={8} maxLength={1000}/></label>
    <button type="button" disabled={busy || code.length < 3 || reason.trim().length < 8} onClick={redeem}>Mark as used</button>
    {message ? <p role="status">{message}</p> : null}
  </div></section>;
}
