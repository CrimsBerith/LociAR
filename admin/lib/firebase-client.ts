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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const result = await response.json() as { ok?: boolean; redirect?: string; reason?: string };
  if (!response.ok || !result.ok) throw new Error(result.reason ?? 'session_failed');
  return result.redirect ?? '/admin/mfa';
}
