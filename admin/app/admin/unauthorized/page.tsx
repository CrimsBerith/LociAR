import { getI18n } from '../../../lib/i18n-server';

export default async function UnauthorizedPage() {
  const { t } = await getI18n();
  return (
    <main id="main" tabIndex={-1} className="authPage">
      <section className="authCard">
        <p className="eyebrow">{t('Access denied')}</p>
        <h1>{t('Permission required')}</h1>
        <p className="muted">{t('Your account is authenticated, but its assigned role cannot open this resource.')}</p>
        <a className="buttonLink" href="/admin/dashboard">{t('Return to dashboard')}</a>
      </section>
    </main>
  );
}
