export default function Loading() {
  return (
    <div className="authPage routeState" lang="tr" aria-busy="true">
      <section className="authCard" aria-labelledby="loading-heading">
        <h1 id="loading-heading">Yükleniyor</h1>
        <output className="muted">İçerik hazırlanıyor. Lütfen bekleyin.</output>
      </section>
    </div>
  );
}
