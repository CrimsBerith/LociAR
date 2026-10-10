'use client';

import { useEffect, useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { ADMIN_EMAIL_STORAGE_KEY, clientAuth } from '../../../lib/firebase-client';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'mfa_enrolled') setMessage('Authenticator added. Sign in again to complete MFA.');
    if (reason === 'admin_required') setMessage('An administrator session is required.');
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const target = email.trim().toLowerCase();
      await sendSignInLinkToEmail(clientAuth(), target, {
        url: window.location.origin + '/auth/callback',
        handleCodeInApp: true,
      });
      window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, target);
      setCooldown(60);
      setMessage('Email sent. Open the newest link; older links expire immediately. The link can be opened in any browser.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in link could not be sent.');
    }
    setBusy(false);
  }

  return (
    <main id="main" tabIndex={-1} className="authPage">
      <section className="authCard">
        <div className="brandMark">L</div>
        <p className="eyebrow">LociAR operations</p>
        <h1>Admin sign in</h1>
        <p className="muted">Allowlisted administrators only. MFA is required after the magic link.</p>
        <form onSubmit={sendLink} className="stack">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" />
          <button type="submit" disabled={busy || cooldown > 0}>
            {busy ? 'Sending…' : cooldown > 0 ? `Retry in ${cooldown}s` : 'Send secure sign-in link'}
          </button>
        </form>
        {message ? <p className="formMessage" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
