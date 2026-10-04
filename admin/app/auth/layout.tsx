import type { ReactNode } from 'react';

// Rendered per request so proxy.ts can attach a fresh CSP script nonce (no 'unsafe-inline' scripts).
export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
