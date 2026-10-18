import type { ReactNode } from 'react';
import { getI18n } from '../../lib/i18n-server';
import { I18nProvider } from './I18nProvider';

// Rendered per request so proxy.ts can attach a fresh CSP script nonce (no 'unsafe-inline' scripts).
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const { lang } = await getI18n();
  return <I18nProvider lang={lang}><div lang={lang} className="langRoot">{children}</div></I18nProvider>;
}
