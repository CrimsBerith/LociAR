"use client";

import { useT } from '../I18nProvider';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const digest = error.digest && /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest) ? error.digest : undefined;
  return (
    <section className="page routeState" aria-labelledby="admin-error-heading">
      <h1 id="admin-error-heading">{t('Panel data could not be opened')}</h1>
      <p className="muted">{t('A temporary problem occurred. Please try again.')}</p>
      {digest ? <p className="muted">{t('Error code')}: <code>{digest}</code></p> : null}
      <button type="button" onClick={() => reset()}>{t('Try again')}</button>
    </section>
  );
}
