import Link from 'next/link';
import { pageHref } from '../../../lib/pagination';
import { getI18n } from '../../../lib/i18n-server';

export default async function PageNavigation({ path, parameters = {}, next, previous, prefix = '', scan = false }: {
  path: string;
  parameters?: Record<string, string | undefined>;
  next: string | null;
  previous: string | null;
  prefix?: string;
  scan?: boolean;
}) {
  if (!next && !previous) return null;
  const { t } = await getI18n();
  return <nav className="filterBar" aria-label={`${prefix || 'Records'} pagination`} style={{ padding: '16px', flexWrap: 'wrap' }}>
    {previous ? <Link className="secondaryButton" prefetch={false} href={pageHref(path, parameters, previous, 'before', prefix)}>{t('Previous records')}</Link> : null}
    {next ? <Link className="secondaryButton" prefetch={false} href={pageHref(path, parameters, next, 'after', prefix)}>{scan ? t('Continue searching older records') : t('Next records')}</Link> : null}
    <Link prefetch={false} href={pageHref(path, parameters, null, 'after', prefix)}>{t('First page')}</Link>
  </nav>;
}
