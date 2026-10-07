import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="authPage routeState" lang="tr">
      <section className="authCard" aria-labelledby="not-found-heading">
        <p className="eyebrow">LociAR · 404</p>
        <h1 id="not-found-heading">Sayfa bulunamadı</h1>
        <p className="muted">Bu sayfa mevcut değil veya taşınmış olabilir.</p>
        <Link className="buttonLink" href="/support">Destek sayfasına git</Link>
      </section>
    </main>
  );
}
