"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest && /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest) ? error.digest : undefined;
  return (
    <section className="page routeState" lang="tr" aria-labelledby="admin-error-heading">
      <h1 id="admin-error-heading">Panel verileri açılamadı</h1>
      <p className="muted">Geçici bir sorun oluştu. Lütfen tekrar deneyin.</p>
      {digest ? <p className="muted">Hata kodu: <code>{digest}</code></p> : null}
      <button type="button" onClick={() => reset()}>Tekrar dene</button>
    </section>
  );
}
