'use client';
import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../lib/client-mutation';
export default function ManualNotificationForm({ recipientId }: { recipientId: string }) {
  const mutation = useRef(createMutationClient()), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', { action: 'notify', recipientId,
        title: data.get('title'), message: data.get('message'), reason: data.get('reason') });
      if (!response.ok) throw new Error(result.error ?? 'Notification could not be queued');
      mutation.current.clear(); setMessage('Queued. Check Campaigns for FCM attempt status.');
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }
  return <details><summary>Send this user a notification</summary><form className="decisionForm" onSubmit={submit}>
    <p className="muted">User must have opted in to campaign and administrator notifications. Write in the recipient&apos;s language. No automatic translation.</p>
    <label>Title<input name="title" required maxLength={80} /></label><label>Message<textarea name="message" required maxLength={240} /></label>
    <label>Reason<input name="reason" required minLength={8} maxLength={1000} /></label><button disabled={busy}>Queue notification</button>
    {message ? <p role="status">{message}</p> : null}
  </form></details>;
}
