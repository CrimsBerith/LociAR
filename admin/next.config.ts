import type { NextConfig } from 'next';

/**
 * Firebase App Hosting injects the linked web app's public config as FIREBASE_WEBAPP_CONFIG at build
 * time. Map it onto the NEXT_PUBLIC_* names the sign-in page reads, so the browser identifiers never
 * have to be copied by hand. Explicit NEXT_PUBLIC_* values (local `next dev`) still win.
 */
function webAppConfigEnv(): Record<string, string> {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return {};
  let config: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string };
  try {
    config = JSON.parse(raw);
  } catch {
    return {};
  }
  const mapped: Record<string, string | undefined> = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || config.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || config.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || config.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || config.appId,
  };
  return Object.fromEntries(Object.entries(mapped).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

const nextConfig: NextConfig = {
  env: webAppConfigEnv(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
