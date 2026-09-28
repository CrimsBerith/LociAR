'use client';

import { signOut } from 'firebase/auth';
import { clientAuth } from '../../../lib/firebase-client';

export default function SignOutButton() {
  async function run() {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
    try { await signOut(clientAuth()); } catch { /* client auth not configured */ }
    window.location.replace('/admin/login');
  }
  return <button type="button" className="secondaryButton" onClick={run}>Sign out</button>;
}
