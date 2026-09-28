'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const actions = [
  { key: 'dismiss', label: 'Dismiss', className: 'secondaryButton' },
  { key: 'approve', label: 'Approve', className: '' },
  { key: 'flag', label: 'Remove', className: 'dangerButton' },
  { key: 'soft_delete', label: 'Trash', className: 'dangerButton' },
] as const;

export default function FlagActions({ flagId, hasPost }: { flagId: string; hasPost: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(action: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/v1/moderation/${flagId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Moderation decision failed');
      setMessage('Decision recorded in audit.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Moderation decision failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decisionForm">
      <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason (minimum 8 characters)" aria-label="Moderation reason" />
      <div className="buttonRow">
        {actions.map(action => (
          <button key={action.key} type="button" className={action.className} disabled={busy || reason.trim().length < 8 || (!hasPost && action.key !== 'dismiss')} onClick={() => decide(action.key)}>{action.label}</button>
        ))}
      </div>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
