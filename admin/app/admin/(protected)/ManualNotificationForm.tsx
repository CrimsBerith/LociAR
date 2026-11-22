'use client';
import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../lib/client-mutation';
import { useT } from '../I18nProvider';
export default function ManualNotificationForm({ recipientId }: Readonly<{ recipientId: string }>) {
  const t = useT();
  const [mutation] = useState(createMutationClient), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget, data = new FormData(form);
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const { response, result } = await mutation.post('/api/admin/v1/campaigns', { action: 'notify', recipientId,
        title: data.get('title'), message: data.get('message'), reason: data.get('reason') });
      if (!response.ok) throw new Error(result.error ?? 'Notification could not be queued');
      // Clear the form with the key: submitting the same text again must be a deliberate new notice.
      mutation.clear(); form.reset(); setMessage(t('Queued. Check Campaigns for FCM attempt status.'));
    } catch (error) { setMessage(t(mutationError(error))); } finally { inFlight.current = false; setBusy(false); }
  }
  return <details><summary>{t('Send this user a notification')}</summary><form className="decisionForm" onSubmit={submit}>
    <p className="muted">{t("User must have enabled Notifications. This form is for administrator messages; send marketing offers through a campaign with separate campaign consent. Write in the recipient's language. No automatic translation.")}</p>
    <label>{t('Title')}<input name="title" required maxLength={80} /></label><label>{t('Message')}<textarea name="message" required maxLength={240} /></label>
    <label>{t('Reason')}<input name="reason" required minLength={8} maxLength={1000} /></label><button type="submit" disabled={busy}>{t('Queue notification')}</button>
    {message ? <output>{message}</output> : null}
  </form></details>;
}
