'use client';

import { useEffect, useState } from 'react';
import MagicLinkForm from './MagicLinkForm';
import LanguageSwitcher from '../LanguageSwitcher';
import { useLang, useT } from '../I18nProvider';

// The sign-in API answers in Turkish; show its messages in English when the panel is in English.
const API_MESSAGES_EN: Record<string, string> = {
  'Adres yetkiliyse giriş kodu gönderildi. Gelen kutunu ve spam klasörünü kontrol et.': 'If this address is authorized, a sign-in code was sent. Check your inbox and spam folder.',
  'Kod geçersiz, süresi dolmuş veya deneme sınırına ulaşılmış. Yeni kod iste.': 'The code is invalid, expired or out of attempts. Request a new code.',
  'Geçersiz işlem.': 'Invalid operation.',
  'JSON gerekli.': 'JSON required.',
  'Çok fazla istek. Bir süre sonra yeniden dene.': 'Too many requests. Try again in a while.',
  'Giriş e-postası gönderilemedi. Gönderici hizmetinin yapılandırılması veya kontrol edilmesi gerekiyor.': 'The sign-in email could not be sent. The email sender needs to be configured or checked.',
  'Giriş işlemi tamamlanamadı.': 'Sign-in could not be completed.',
};

export default function AdminLogin() {
  const t = useT();
  const lang = useLang();
  const api = (text: string) => (lang === 'en' ? API_MESSAGES_EN[text] ?? text : text);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/auth/email-code', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', email }) });
      const result = await response.json();
      if (!response.ok) throw new Error(api(result.error ?? '') || t('The code could not be sent.'));
      setSent(true); setCode(''); setCooldown(60); setMessage(api(result.message ?? ''));
    } catch (error) { setMessage(error instanceof Error && error.message ? error.message : t('Could not connect. Try again.')); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/auth/email-code', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(api(result.error ?? '') || t('The code could not be verified.'));
      window.location.replace('/admin/dashboard');
    } catch (error) { setMessage(error instanceof Error && error.message ? error.message : t('Could not connect. Try again.')); setBusy(false); }
  }

  return <main id="main" tabIndex={-1} className="authPage"><section className="authCard">
    <div className="authTop"><div className="brandMark">L</div><LanguageSwitcher /></div>
    <p className="eyebrow">{t('LociAR administration')}</p><h1>{t('Administrator sign-in')}</h1>
    <p className="muted">{t('Sign in with the 6-digit code sent to your email. Only authorized administrator accounts can access.')}</p>
    {!sent ? <form onSubmit={requestCode} className="stack">
      <label htmlFor="otp-email">{t('Email')}</label>
      <input id="otp-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/>
      <button type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send sign-in code')}</button>
    </form> : <>
      <p>{email}</p><p className="muted">{t('The code is valid for 10 minutes. Keep this page open in the browser where you requested the code.')}</p>
      <form onSubmit={verify} className="stack">
        <label htmlFor="email-code">{t('6-digit sign-in code')}</label>
        <input id="email-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          required value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy}/>
        <button type="submit" disabled={busy || code.length !== 6}>{busy ? t('Checking…') : t('Sign in')}</button>
      </form>
      <button type="button" className="secondaryButton" onClick={() => requestCode()} disabled={busy || cooldown > 0}>
        {cooldown > 0 ? t('Resend in {seconds} seconds', { seconds: cooldown }) : t('Send a new code')}</button>
      <button type="button" className="secondaryButton" disabled={busy} onClick={() => { setSent(false); setCode(''); setMessage(''); }}>{t('Use a different email')}</button>
    </>}
    {message ? <p className="formMessage" role="status">{message}</p> : null}
    <details><summary>{t('Previous link / Authenticator method')}</summary><MagicLinkForm/></details>
  </section></main>;
}
