'use client';
import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../lib/client-mutation';
import { useT } from '../I18nProvider';
import { useSelectedUsers, writeSelection } from './UserSelection';

export default function BulkNotificationForm() {
  const t = useT(), selected = useSelectedUsers();
  const mutation = useRef(createMutationClient()), [busy, setBusy] = useState(false), [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form), target = data.get('target');
    const handles = String(data.get('handles') ?? '').split(/[\s,;]+/).map(handle => handle.replace(/^@/, '').toLowerCase()).filter(Boolean);
    if (target === 'selected' && selected.length + handles.length === 0) { setMessage(t('Select at least one user.')); return; }
    if (target === 'all' && data.get('confirmAll') !== 'yes') { setMessage(t('Confirm the all-users send.')); return; }
    setBusy(true);
    setMessage('');
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/campaigns', {
        action: 'notify-batch',
        target,
        ...(target === 'selected' ? { recipientIds: selected, ...(handles.length ? { handles } : {}) } : { confirmAll: true }),
        title: data.get('title'),
        message: data.get('message'),
        reason: data.get('reason'),
      });
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Notification batch could not be queued');
      mutation.current.clear();
      const queued = (result.result ?? {}) as { recipientCount?: unknown };
      setMessage(target === 'all'
        ? t('All-users batch queued. Consent checks and delivery continue in the background.')
        : t('Batch queued for {count} selected users. Check Campaigns for progress.', {
          count: typeof queued.recipientCount === 'number' ? queued.recipientCount : selected.length + handles.length,
        }));
      if (target === 'selected') writeSelection([]);
      form.reset();
    } catch (error) {
      setMessage(t(mutationError(error)));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h2>{t('Bulk administrator notice')}</h2>
    <p className="muted">{t('Tick users in the list below (the choice is kept while you page or search, up to 200), type @handles, or send to all eligible users. All includes regular active accounts with Notifications enabled and remaining daily quota; opted-out or ineligible users are skipped. Location and Campaigns and offers consent are not used.')}</p>
    <form id="bulk-notification-form" className="decisionForm" onSubmit={submit}>
      <label><input type="radio" name="target" value="selected" defaultChecked />{t('Selected users')} ({selected.length})</label>
      <label>{t('Extra handles (optional, separated by spaces, commas or new lines)')}<textarea name="handles" rows={2} placeholder="@ayse, mehmet" /></label>
      <label><input type="radio" name="target" value="all" />{t('All eligible users')}</label>
      <label><input type="checkbox" name="confirmAll" value="yes" />{t('I confirm sending this notice to all eligible users.')}</label>
      <label>{t('Title')}<input name="title" required maxLength={80} /></label>
      <label>{t('Message')}<textarea name="message" required maxLength={240} /></label>
      <label>{t('Reason')}<input name="reason" required minLength={8} maxLength={1000} /></label>
      <button type="submit" disabled={busy}>{t('Queue notification')}</button>
      {message ? <output>{message}</output> : null}
    </form>
  </section>;
}
