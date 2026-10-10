export default function Loading() {
  return (
    <main id="main" tabIndex={-1} className="authPage routeState" lang="tr" aria-busy="true">
      <section className="authCard" aria-labelledby="loading-heading">
        <h1 id="loading-heading">Yükleniyor</h1>
        <p className="muted" role="status">İçerik hazırlanıyor. Lütfen bekleyin.</p>
      </section>
    </main>
  );
}
