'use client';

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { clientAuth } from '../../../lib/firebase-client';
import { useT } from '../I18nProvider';

export default function SignOutButton() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    // A network failure still ends the local session and leaves the panel.
    try { await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' }); } catch { /* offline */ }
    try { await signOut(clientAuth()); } catch { /* client auth not configured */ }
    window.location.replace('/admin/login');
  }
  return <button type="button" className="secondaryButton" onClick={() => void run()} disabled={busy}>{t('Sign out')}</button>;
}
