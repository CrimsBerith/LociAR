export default function Loading() {
  return (
    <section className="page routeState" lang="tr" aria-busy="true" aria-labelledby="admin-loading-heading">
      <h1 id="admin-loading-heading">Yükleniyor</h1>
      <p className="muted" role="status">Panel verileri hazırlanıyor. Lütfen bekleyin.</p>
    </section>
  );
}
