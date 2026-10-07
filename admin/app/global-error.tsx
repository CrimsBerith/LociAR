"use client";

import './styles.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest && /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest) ? error.digest : undefined;
  return (
    <html lang="tr">
      <head><title>LociAR – Sayfa açılamadı</title></head>
      <body>
        <main id="main" tabIndex={-1} className="authPage routeState">
          <section className="authCard" aria-labelledby="global-error-heading">
            <h1 id="global-error-heading">Sayfa açılamadı</h1>
            <p className="muted">Geçici bir sorun oluştu. Lütfen tekrar deneyin.</p>
            {digest ? <p className="muted">Hata kodu: <code>{digest}</code></p> : null}
            <button type="button" onClick={() => reset()}>Tekrar dene</button>
          </section>
        </main>
      </body>
    </html>
  );
}
