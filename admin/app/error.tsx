"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest && /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest) ? error.digest : undefined;
  return (
    <main id="main" tabIndex={-1} className="authPage routeState" lang="tr">
      <section className="authCard" aria-labelledby="error-heading">
        <h1 id="error-heading">Sayfa açılamadı</h1>
        <p className="muted">Geçici bir sorun oluştu. Lütfen tekrar deneyin.</p>
        {digest ? <p className="muted">Hata kodu: <code>{digest}</code></p> : null}
        <button type="button" onClick={() => reset()}>Tekrar dene</button>
      </section>
    </main>
  );
}
