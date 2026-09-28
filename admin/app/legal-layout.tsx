import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legalPage">
      <header className="legalHeader">
        <p className="eyebrow">LociAR</p>
        <h1>{title}</h1>
        <p className="muted">Son güncelleme: {updated}</p>
        <nav className="legalNav">
          <Link href="/privacy">Gizlilik</Link>
          <Link href="/terms">Koşullar</Link>
          <Link href="/support">Destek</Link>
        </nav>
      </header>
      <article className="legalBody">{children}</article>
    </main>
  );
}
