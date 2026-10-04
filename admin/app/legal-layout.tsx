import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = {
  tr: { updated: 'Son güncelleme', privacy: 'Gizlilik', terms: 'Koşullar', support: 'Destek', suffix: '' },
  en: { updated: 'Last updated', privacy: 'Privacy', terms: 'Terms', support: 'Support', suffix: '/en' },
} as const;

export default function LegalLayout({
  title,
  updated,
  lang = 'tr',
  children,
}: {
  title: string;
  updated: string;
  lang?: 'tr' | 'en';
  children: ReactNode;
}) {
  const t = NAV[lang];
  return (
    <main className="legalPage" lang={lang}>
      <header className="legalHeader">
        <p className="eyebrow">LociAR</p>
        <h1>{title}</h1>
        <p className="muted">{t.updated}: {updated}</p>
        <nav className="legalNav">
          <Link href={`/privacy${t.suffix}`}>{t.privacy}</Link>
          <Link href={`/terms${t.suffix}`}>{t.terms}</Link>
          <Link href={`/support${t.suffix}`}>{t.support}</Link>
        </nav>
      </header>
      <article className="legalBody">{children}</article>
    </main>
  );
}
