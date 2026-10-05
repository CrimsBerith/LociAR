'use client';

import { useRef, useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { clientAuth } from '../../../../lib/firebase-client';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

export default function InviteUserForm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(createMutationClient());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const { response, result } = await mutation.current.post('/api/admin/v1/users/invite', {
        email: form.get('email'),
        handle: form.get('handle') || null,
        roleKey: form.get('roleKey') || null,
        reason: form.get('reason'),
      });
      if (!response.ok) { setMessage(result.error ?? 'Invite failed. Please retry.'); return; }
      const roleKey = form.get('roleKey');
      const invite = result.invite as { id?: string } | undefined;
      if (!invite?.id) throw new Error('The invitation could not be confirmed. Please retry.');
      await sendSignInLinkToEmail(clientAuth(), String(result.email ?? form.get('email')), {
        url: roleKey ? window.location.origin + '/auth/callback'
          : window.location.origin + '/auth/invite?invite=' + encodeURIComponent(invite.id),
        handleCodeInApp: true,
      });
      setMessage('Invitation sent and recorded in audit.');
      mutation.current.clear();
      formElement.reset();
    } catch (error) {
      setMessage(mutationError(error) + ' You can retry this invitation without creating a second record.');
    } finally {
      setBusy(false);
    }
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
