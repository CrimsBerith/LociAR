'use client';

import { signOut } from 'firebase/auth';
import { clientAuth } from '../../../lib/firebase-client';
import { useT } from '../I18nProvider';

export default function SignOutButton() {
  const t = useT();
  async function run() {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
    try { await signOut(clientAuth()); } catch { /* client auth not configured */ }
    window.location.replace('/admin/login');
  }
  return <button type="button" className="secondaryButton" onClick={run}>{t('Sign out')}</button>;
}
