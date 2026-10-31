import { getI18n } from '../../../lib/i18n-server';

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <section className="page routeState" aria-busy="true" aria-labelledby="admin-loading-heading">
      <h1 id="admin-loading-heading">{t('Loading')}</h1>
      <output className="muted">{t('Preparing panel data. Please wait.')}</output>
    </section>
  );
}
