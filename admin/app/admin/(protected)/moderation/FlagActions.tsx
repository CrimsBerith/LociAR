'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

const actions = [
  { key: 'dismiss', label: 'Dismiss', className: 'secondaryButton' },
  { key: 'approve', label: 'Approve', className: '' },
  { key: 'flag', label: 'Flag', className: 'secondaryButton' },
  { key: 'soft_delete', label: 'Remove', className: 'dangerButton' },
] as const;

export default function FlagActions({ flagId, hasPost }: { flagId: string; hasPost: boolean }) {
  const router = useRouter();
  const t = useT();
  const [mutation] = useState(createMutationClient);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(action: string) {
    setBusy(true);
    setMessage('');
    try {
      const { response, result: payload } = await mutation.post(`/api/admin/v1/moderation/${flagId}/decision`, { action, reason });
      if (!response.ok) throw new Error(String(payload.error ?? 'Moderation decision failed'));
      mutation.clear();
      setMessage(t('Decision recorded in audit.'));
      router.refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : 'Moderation decision failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={reason} onChange={event => setReason(event.target.value)} placeholder={t('Reason (minimum 8 characters)')} aria-label={t('Moderation reason')} />
      <div className="buttonRow">
        {actions.map(action => (
          <button key={action.key} type="button" className={action.className} disabled={busy || reason.trim().length < 8 || (!hasPost && action.key !== 'dismiss')} onClick={() => decide(action.key)}>{t(action.label)}</button>
        ))}
      </div>
      {message ? <output>{message}</output> : null}
    </div>
  );
}
