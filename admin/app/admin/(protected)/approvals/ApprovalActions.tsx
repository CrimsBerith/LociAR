'use client';

import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';
import { useT } from '../../I18nProvider';

export default function ApprovalActions({ approvalId }: { approvalId: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mutation = useRef(createMutationClient());

  async function decide(decision: 'approved' | 'rejected') {
    const reason = window.prompt(
      decision === 'approved'
        ? t('Independent approval reason (minimum 8 characters)')
        : t('Rejection reason (minimum 8 characters)'),
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
        setMessage(t(result.error ?? 'Decision failed.'));
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessage(t(mutationError(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="postActions">
      <div className="buttonRow">
        <button disabled={busy} onClick={() => decide('approved')}>{t('Approve & execute')}</button>
        <button disabled={busy} className="dangerButton" onClick={() => decide('rejected')}>{t('Reject')}</button>
      </div>
      {message ? <small className="formMessage" role="status">{message}</small> : null}
    </div>
  );
}
