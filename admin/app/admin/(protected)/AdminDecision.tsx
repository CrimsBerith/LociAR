'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = { label: string; body: Record<string, unknown>; className?: string };

/** Reason + buttons that POST an audited admin decision with a fresh idempotency key. */
export default function AdminDecision({ endpoint, actions }: { endpoint: string; actions: Action[] }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ ...body, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Decision failed');
      setMessage('Decision recorded in audit.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Decision failed');
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
