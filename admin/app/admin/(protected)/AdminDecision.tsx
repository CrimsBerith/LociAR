'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMutationClient, mutationError } from '../../../lib/client-mutation';

type Action = { label: string; body: Record<string, unknown>; className?: string };

/** Reason + buttons that retain an operation key while its outcome is unconfirmed. */
export default function AdminDecision({ endpoint, actions }: { endpoint: string; actions: Action[] }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(createMutationClient());

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const { response, result: payload } = await mutation.current.post(endpoint, { ...body, reason });
      if (!response.ok) throw new Error(payload.error ?? 'Decision failed');
      setMessage('Decision recorded in audit.');
      mutation.current.clear();
      router.refresh();
    } catch (error) {
      setMessage(mutationError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason (minimum 8 characters)" aria-label="Decision reason" />
      <div className="buttonRow">
        {actions.map(action => (
          <button key={action.label} type="button" className={action.className ?? ''} disabled={busy || reason.trim().length < 8} onClick={() => decide(action.body)}>{action.label}</button>
        ))}
      </div>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
