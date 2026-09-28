'use client';

import { useState } from 'react';

export default function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function decide(decision: 'approved' | 'rejected') {
    const reason = window.prompt(
      decision === 'approved'
        ? 'Independent approval reason (minimum 8 characters)'
        : 'Rejection reason (minimum 8 characters)',
    );
    if (!reason) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(
      `/api/admin/v1/approvals/${approvalId}/decision`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ decision, reason }),
      },
    );
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error ?? 'Decision failed.');
      return;
    }
    window.location.reload();
  }

  return (
    <div className="postActions">
      <div className="buttonRow">
        <button disabled={busy} onClick={() => decide('approved')}>Approve & execute</button>
        <button disabled={busy} className="dangerButton" onClick={() => decide('rejected')}>Reject</button>
      </div>
      {message ? <small className="formMessage" role="status">{message}</small> : null}
    </div>
  );
}
