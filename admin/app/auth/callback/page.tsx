'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getMultiFactorResolver, isSignInWithEmailLink, signInWithEmailLink, TotpMultiFactorGenerator,
  type MultiFactorError, type MultiFactorResolver, type UserCredential,
} from 'firebase/auth';
import { ADMIN_EMAIL_STORAGE_KEY, clientAuth, persistServerSession } from '../../../lib/firebase-client';

export default function AuthCallbackPage() {
  const [failure, setFailure] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const linkRef = useRef('');

  async function finish(credential: UserCredential) {
    const idToken = await credential.user.getIdToken(true);
    window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
    window.location.replace(await persistServerSession(idToken));
  }

  async function complete(targetEmail: string) {
    try {
      await finish(await signInWithEmailLink(clientAuth(), targetEmail, linkRef.current));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/multi-factor-auth-required') {
        setResolver(getMultiFactorResolver(clientAuth(), error as MultiFactorError));
        return;
      }
      throw error;
    }
  }

  useEffect(() => {
    let active = true;
    const href = window.location.href;
    window.history.replaceState({}, '', window.location.pathname);
    linkRef.current = href;
    (async () => {
      if (!isSignInWithEmailLink(clientAuth(), href)) throw new Error('missing_callback_data');
      const stored = window.localStorage.getItem(ADMIN_EMAIL_STORAGE_KEY);
      if (!stored) {
        if (active) setNeedsEmail(true);
        return;
      }
      await complete(stored);
    })().catch(error => {
      if (active) setFailure(error instanceof Error ? error.message : 'callback_failed');
    });
    return () => { active = false; };
  }, []);

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await complete(email.trim().toLowerCase());
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'callback_failed');
    }
    setBusy(false);
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!resolver) return;
    setBusy(true);
    try {
      const hint = resolver.hints.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
      if (!hint) throw new Error('no_totp_factor');
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s/g, ''));
      await finish(await resolver.resolveSignIn(assertion));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'mfa_failed');
      setBusy(false);
    }
  }

  const heading = failure
    ? 'Sign-in link could not be completed'
    : resolver ? 'Multi-factor authentication' : needsEmail ? 'Confirm your email' : 'Completing secure sign-in…';

  return (
    <main id="main" tabIndex={-1} className="authPage">
      <section className="authCard">
        <div className="brandMark">L</div>
        <p className="eyebrow">LociAR operations</p>
        <h1>{heading}</h1>
        {!failure && resolver ? (
          <form onSubmit={submitCode} className="stack">
            <label htmlFor="totp">Authenticator code</label>
            <input id="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required autoComplete="one-time-code" />
            <button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
          </form>
        ) : null}
        {!failure && needsEmail && !resolver ? (
          <form onSubmit={submitEmail} className="stack">
            <label htmlFor="email">Email used to request the link</label>
            <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" />
            <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        ) : null}
        <p className="muted">
          {failure
            ? 'Request one new link and open only the newest email. Older links expire immediately.'
            : 'This page validates the one-time link before MFA.'}
        </p>
        {failure ? <p className="formMessage" role="alert">Reference: {failure}</p> : null}
        {failure ? <Link className="buttonLink" href="/admin/login">Return to admin sign in</Link> : null}
      </section>
    </main>
  );
}
