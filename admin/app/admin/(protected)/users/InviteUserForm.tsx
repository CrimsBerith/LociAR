'use client';

import { useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { clientAuth } from '../../../../lib/firebase-client';

export default function InviteUserForm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/admin/v1/users/invite', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        email: form.get('email'),
        handle: form.get('handle') || null,
        roleKey: form.get('roleKey') || null,
        reason: form.get('reason'),
      }),
    });
    const result = await response.json() as { error?: string; email?: string; idempotent?: boolean };
    if (!response.ok) {
      setBusy(false);
      setMessage(result.error ?? 'Invite failed.');
      return;
    }
    try {
      const roleKey = form.get('roleKey');
      await sendSignInLinkToEmail(clientAuth(), String(result.email ?? form.get('email')), {
        url: roleKey ? window.location.origin + '/auth/callback' : window.location.origin + '/support',
        handleCodeInApp: true,
      });
      setMessage('Invitation sent and recorded in audit.');
      formElement.reset();
    } catch (error) {
      setMessage(`Invite recorded, but the email could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        {open ? 'Close invite' : 'Invite user'}
      </button>
      {open ? (
        <section className="panel actionPanel">
          <div className="panelHeader"><div><p className="eyebrow">Magic link</p><h2>Invite a user or administrator</h2></div></div>
          <form className="actionForm" onSubmit={submit}>
            <label>Email<input name="email" type="email" required autoComplete="off" /></label>
            <label>Requested handle<input name="handle" minLength={3} maxLength={40} autoComplete="off" /></label>
            <label>Admin role
              <select name="roleKey" defaultValue="">
                <option value="">Regular user</option>
                <option value="trust_safety_admin">Trust & Safety Admin</option>
                <option value="ar_operations_admin">AR Operations Admin</option>
                <option value="support_agent">Support Agent</option>
                <option value="analyst">Analyst</option>
              </select>
            </label>
            <label className="wide">Reason<input name="reason" minLength={8} maxLength={1000} required placeholder="Why is this invitation needed?" /></label>
            <button disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
          </form>
          {message ? <p className="formMessage" role="status">{message}</p> : null}
        </section>
      ) : null}
    </>
  );
}
