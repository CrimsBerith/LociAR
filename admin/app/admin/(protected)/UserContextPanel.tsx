'use client';
import { useEffect, useState } from 'react';
import ManualNotificationForm from './ManualNotificationForm';
import { useT } from '../I18nProvider';

type Result = { status: string; lat?: number; lng?: number; accuracy?: number; measuredAt?: string; receivedAt?: string;
  device?: { model: string; osVersion: string; appVersion: string; appBuild: string; locale: string; timeZone: string;
    installationId: string; observedIp: string | null; lastSeen: string };
  events?: Array<{ name: string; at: string; postId: string | null }> };

export default function UserContextPanel({ luid, canLocation, canTelemetry, canNotify = false }: { luid: string; canLocation: boolean; canTelemetry: boolean; canNotify?: boolean }) {
  const t = useT();
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    const clear = () => { if (document.visibilityState !== 'visible') setResult(null); };
    document.addEventListener('visibilitychange', clear);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', clear); };
  }, []);
  async function read(kind: 'location' | 'telemetry') {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/admin/v1/users/${encodeURIComponent(luid)}/context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ reason, kind }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Private data could not be loaded');
      setNow(Date.now()); if (document.visibilityState === 'visible') setResult(body.result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Private data could not be loaded'); }
    finally { setBusy(false); }
  }
  const recent = result?.status === 'recent' && result.measuredAt && now - Date.parse(result.measuredAt) <= 120_000;
  return <section className="panel">
    <h2>{t('Private user data')}</h2>
    <p className="muted">{t('Optional user consent is required. Each read is audited. Location is the last device report while the app was open; it is not a guaranteed live location.')}</p>
    <label>{t('Access reason')}<input value={reason} onChange={e => setReason(e.target.value)} minLength={8} maxLength={1000} placeholder={t('Describe the purpose of this access')} /></label>
    <div className="filterBar">
      {canLocation ? <button disabled={busy || reason.trim().length < 8} onClick={() => read('location')}>{t('Read last shared location')}</button> : null}
      {canTelemetry ? <button disabled={busy || reason.trim().length < 8} onClick={() => read('telemetry')}>{t('Read device and usage data')}</button> : null}
    </div>
    {error ? <p role="alert">{t(error)}</p> : null}
    {result?.status === 'sharing_disabled' ? <p>{t('User has not enabled this sharing.')}</p> : null}
    {result?.status === 'unavailable' ? <p>{t('No unexpired report is available.')}</p> : null}
    {result && (result.status === 'recent' || result.status === 'stale') ? <div>
      <p><strong>{recent ? t('Recent report') : t('Stale report — current location unknown')}</strong></p>
      <p>{result.lat}, {result.lng} · {t('Accuracy')}: ±{Math.round(result.accuracy ?? 0)} m</p>
      <p>{t('Measured')}: {result.measuredAt} · {t('Received')}: {result.receivedAt}</p>
      <a href={`https://maps.apple.com/?ll=${result.lat},${result.lng}`} target="_blank" rel="noopener noreferrer">{t('Open last reported coordinates in Maps')}</a>
    </div> : null}
    {result?.device ? <div>
      <p>{result.device.model} · iOS {result.device.osVersion} · App {result.device.appVersion} ({result.device.appBuild})</p>
      <p>{result.device.locale} · {result.device.timeZone} · {t('Last seen')}: {result.device.lastSeen}</p>
      <p>{t('Installation')}: {result.device.installationId} · {t('Observed connection IP')}: {result.device.observedIp ?? t('Unavailable')}</p>
      <p className="muted">{t("Device fields and location are reported by the client. An installation ID or IP does not establish a person's identity.")}</p>
      <ul>{result.events?.map((event, i) => <li key={i}>{event.at} · {event.name}{event.postId ? ` · ${event.postId}` : ''}</li>)}</ul>
    </div> : null}
    {canNotify ? <ManualNotificationForm recipientId={luid} /> : null}
  </section>;
}
