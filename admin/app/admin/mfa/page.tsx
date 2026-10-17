'use client';

import { useEffect, useState } from 'react';
import { multiFactor, onAuthStateChanged, signOut, TotpMultiFactorGenerator, type TotpSecret, type User } from 'firebase/auth';
import QRCode from 'qrcode';
import { clientAuth } from '../../../lib/firebase-client';
import { useT } from '../I18nProvider';

async function endSession() {
  await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
  await signOut(clientAuth());
}

export default function AdminMfa() {
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(() => t('Loading your security factors…'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let auth;
    try {
      auth = clientAuth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Admin authentication is not configured.'));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (!active) return;
      if (!current) {
        window.location.replace('/admin/login?reason=admin_required');
        return;
      }
      setUser(current);
      try {
        if (multiFactor(current).enrolledFactors.length > 0) {
          setMessage(t('An authenticator is already enrolled. Sign in again and enter its code to continue.'));
          return;
        }
        const session = await multiFactor(current).getSession();
        const generated = await TotpMultiFactorGenerator.generateSecret(session);
        const uri = generated.generateQrCodeUrl(current.email ?? 'admin', 'LociAR Admin');
        if (!active) return;
        setSecret(generated);
        setQr(await QRCode.toDataURL(uri, { margin: 1, width: 220 }));
        setMessage(t('Scan the QR code with your authenticator app, then enter the six-digit code.'));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('MFA setup failed.'));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !secret) return;
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s/g, ''));
      await multiFactor(user).enroll(assertion, 'LociAR Admin');
      await endSession();
      window.location.replace('/admin/login?reason=mfa_enrolled');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Verification failed.'));
      setBusy(false);
    }
  }

  async function restart() {
    await endSession();
    window.location.replace('/admin/login');
  }

  return (
    <main id="main" tabIndex={-1} className="authPage">
      <section className="authCard">
        <div className="brandMark">L</div>
        <p className="eyebrow">{t('Required security step')}</p>
        <h1>{t('Multi-factor authentication')}</h1>
        <p className="muted">{message}</p>
        {qr ? <img className="qrCode" src={qr} alt={t('Authenticator enrollment QR code')} /> : null}
        {secret ? (
          <form onSubmit={verify} className="stack">
            <label htmlFor="totp">{t('Authenticator code')}</label>
            <input id="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required autoComplete="one-time-code" />
            <button type="submit" disabled={busy}>{busy ? t('Verifying…') : t('Verify and continue')}</button>
          </form>
        ) : (
          <button type="button" onClick={restart}>{t('Sign in again')}</button>
        )}
      </section>
    </main>
  );
}
