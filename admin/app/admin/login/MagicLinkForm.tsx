'use client';

import { useEffect, useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { ADMIN_EMAIL_STORAGE_KEY, clientAuth } from '../../../lib/firebase-client';
import { useT } from '../I18nProvider';

export default function MagicLinkForm() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'mfa_enrolled') setMessage(t('Authenticator added. Sign in again to complete MFA.'));
    if (reason === 'admin_required') setMessage(t('An administrator session is required.'));
  }, [t]);

  // One interval for the whole countdown, not a new one every second.
  const counting = cooldown > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [counting]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const target = email.trim().toLowerCase();
      await sendSignInLinkToEmail(clientAuth(), target, {
        url: window.location.origin + '/auth/callback',
        handleCodeInApp: true,
      });
      // The link is already sent; private browsing may refuse storage, and the callback can ask for the email.
      try { window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, target); } catch { /* not required */ }
      setCooldown(60);
      setMessage(t('Sign-in email requested. Check your inbox and spam folder; older links expire immediately. The link can be opened in any browser.'));
    } catch {
      // Firebase error text names internal codes and endpoints; show the generic message.
      setMessage(t('Sign-in link could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  const sendLabel = cooldown > 0 ? t('Retry in {seconds}s', { seconds: cooldown }) : t('Send secure sign-in link');
  return (
    <section className="stack">
        <p className="muted">{t('Allowlisted administrators only. MFA is required after the magic link.')}</p>
        <form onSubmit={sendLink} className="stack">
          <label htmlFor="legacy-email">{t('Work email')}</label>
          <input id="legacy-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" />
          <button type="submit" disabled={busy || cooldown > 0}>
            {busy ? t('Sending…') : sendLabel}
          </button>
        </form>
        {message ? <output className="formMessage">{message}</output> : null}
</section>
  );
}
