'use client';

import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

export default function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mutation = useRef(createMutationClient());

  async function decide(decision: 'approved' | 'rejected') {
    const reason = window.prompt(
      decision === 'approved'
        ? 'Independent approval reason (minimum 8 characters)'
        : 'Rejection reason (minimum 8 characters)',
    );
    if (!reason) return;
    setBusy(true);
    setMessage('');
    try {
      const { response, result } = await mutation.current.post(
        `/api/admin/v1/approvals/${approvalId}/decision`,
        { decision, reason },
      );
      if (!response.ok) {
        setMessage(result.error ?? 'Decision failed.');
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessage(mutationError(error));
    } finally {
      setBusy(false);
    }
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
