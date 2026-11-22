'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/** Browser Firebase app for admin sign-in (public client identifiers only). */
export function clientAuth(): Auth {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId) throw new Error('Admin authentication is not configured.');
  const app = getApps().length ? getApp() : initializeApp({ apiKey, authDomain, projectId, appId });
  return getAuth(app);
}

export const ADMIN_EMAIL_STORAGE_KEY = 'lociarAdminSignInEmail';

export async function persistServerSession(idToken: string): Promise<string> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  // A proxy error page (502/503) is not JSON: report a failed session, not a parse error.
  const result = await response.json().catch(() => ({})) as { ok?: boolean; redirect?: unknown; reason?: unknown };
  if (!response.ok || !result.ok) throw new Error(typeof result.reason === 'string' ? result.reason : 'session_failed');
  // Only same-site admin paths: never follow a server-supplied absolute or protocol-relative URL.
  const redirect = typeof result.redirect === 'string' && /^\/admin(?:[/?#]|$)/.test(result.redirect) ? result.redirect : '/admin/mfa';
  return redirect;
}
