'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isSignInWithEmailLink, signInWithEmailLink, signOut, updatePassword, type User } from 'firebase/auth';
import { clientAuth } from '../../../lib/firebase-client';
import { mutationError } from '../../../lib/client-mutation';

export default function UserInvitationPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const link = useRef('');
  const inviteId = useRef('');

  useEffect(() => {
    if (!link.current) {
      link.current = window.location.href;
      inviteId.current = new URL(window.location.href).searchParams.get('invite') ?? '';
      window.history.replaceState({}, '', window.location.pathname);
    }
    try {
      if (!isSignInWithEmailLink(clientAuth(), link.current) || !/^[0-9a-f-]{36}$/i.test(inviteId.current)) throw new Error('This invitation link is incomplete or expired. Request a new invitation.');
      setReady(true);
    } catch (error) { setMessage(mutationError(error)); }
  }, []);

  async function confirmEmail(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      // No inviter email is stored in this browser. The invitee explicitly confirms ownership.
      const credential = await signInWithEmailLink(clientAuth(), email.trim().toLowerCase(), link.current);
      setUser(credential.user);
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault(); if (!user) return;
    if (password !== confirmation) { setMessage('Passwords must match.'); return; }
    setBusy(true); setMessage('');
    try {
      // Acceptance is authorized by the fresh verified email-link ID token, not a browser cookie.
      const response = await fetch('/api/auth/invite', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: await user.getIdToken(true), inviteId: inviteId.current }),
      });
      const result = await response.json() as { ok?: boolean; reason?: string };
      if (!response.ok || !result.ok) throw new Error(result.reason ?? 'Invitation could not be confirmed. Please retry.');
      // The iOS app uses email/password sign-in; create that credential without inventing a token handoff.
      await updatePassword(user, password);
      await signOut(clientAuth());
      setPassword(''); setConfirmation(''); setUser(null); setFinished(true);
    } catch (error) { setMessage(mutationError(error)); } finally { setBusy(false); }
  }

  return <main className="authPage"><section className="authCard">
    <div className="brandMark">L</div><p className="eyebrow">LociAR invitation</p>
    <h1>{finished ? 'Your account is ready' : user ? 'Set a password for LociAR' : 'Accept your invitation'}</h1>
    {finished ? <><p>Open LociAR on your iPhone and sign in with your email and the password you just set. Choose your handle and complete onboarding in the app.</p><a className="buttonLink" href="lociar://open">Open LociAR</a></> : null}
    {ready && !user && !finished ? <form className="stack" onSubmit={confirmEmail}>
      <label htmlFor="invite-email">Invited email</label><input id="invite-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
      <button disabled={busy}>{busy ? 'Verifying…' : 'Verify email and continue'}</button>
    </form> : null}
    {user ? <form className="stack" onSubmit={finish}>
      <p>Use this password to sign in to the iOS app. If this address already has a password, this replaces it.</p>
      <label htmlFor="invite-password">Password</label><input id="invite-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} />
      <label htmlFor="invite-confirmation">Confirm password</label><input id="invite-confirmation" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      <button disabled={busy}>{busy ? 'Completing…' : 'Complete invitation'}</button>
    </form> : null}
    {message ? <p className="formMessage" role="alert">{message}</p> : null}
    <Link href="/support">Help and support</Link>
  </section></main>;
}
