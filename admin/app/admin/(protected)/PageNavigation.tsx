import Link from 'next/link';
import { pageHref } from '../../../lib/pagination';

export default function PageNavigation({ path, parameters = {}, next, previous, prefix = '', scan = false }: {
  path: string;
  parameters?: Record<string, string | undefined>;
  next: string | null;
  previous: string | null;
  prefix?: string;
  scan?: boolean;
}) {
  if (!next && !previous) return null;
  return <nav className="filterBar" aria-label={`${prefix || 'Records'} pagination`} style={{ padding: '16px', flexWrap: 'wrap' }}>
    {previous ? <Link className="secondaryButton" prefetch={false} href={pageHref(path, parameters, previous, 'before', prefix)}>Previous records</Link> : null}
    {next ? <Link className="secondaryButton" prefetch={false} href={pageHref(path, parameters, next, 'after', prefix)}>{scan ? 'Continue searching older records' : 'Next records'}</Link> : null}
    <Link prefetch={false} href={pageHref(path, parameters, null, 'after', prefix)}>First page</Link>
  </nav>;
}
