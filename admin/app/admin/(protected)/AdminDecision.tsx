'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../lib/client-mutation';
import { useT } from '../I18nProvider';

type Action = { label: string; body: Record<string, unknown>; className?: string };

/** Reason + buttons that retain an operation key while its outcome is unconfirmed. Labels are translated here. */
export default function AdminDecision({ endpoint, actions }: { endpoint: string; actions: Action[] }) {
  const router = useRouter();
  const t = useT();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(createMutationClient());

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const { response, result: payload } = await mutation.current.post(endpoint, { ...body, reason });
      if (!response.ok) throw new Error(payload.error ?? t('Decision failed'));
      setMessage(t('Decision recorded in audit.'));
      mutation.current.clear();
      router.refresh();
    } catch (error) {
      setMessage(t(mutationError(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={reason} onChange={event => setReason(event.target.value)} placeholder={t('Reason (minimum 8 characters)')} aria-label={t('Decision reason')} />
      <div className="buttonRow">
        {actions.map(action => (
          <button key={action.label} type="button" className={action.className ?? ''} disabled={busy || reason.trim().length < 8} onClick={() => decide(action.body)}>{t(action.label)}</button>
        ))}
      </div>
      {message ? <output>{message}</output> : null}
    </div>
  );
}
