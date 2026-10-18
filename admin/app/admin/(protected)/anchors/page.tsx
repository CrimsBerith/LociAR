import { scalarText } from '../../../../lib/values';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { objectKeys, parseJsonField } from '../../../../lib/geo';
import { getI18n } from '../../../../lib/i18n-server';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function AnchorsPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'anchors.read' });
  const { t, locale } = await getI18n();
  let anchors: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    page = await readDocumentPage(adminDb().collection('posts'), { scope: 'anchors', cursors: pageCursors(params) });
    anchors = page.documents.map(d => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string }).filter(p => p.placement_state && !p.deleted_at);
  } catch {
    failed = true;
  }

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">{t('Spatial operations')}</p><h1>{t('AR anchors')}</h1></div>
        <p className="muted">{t('Resolver and persistence diagnostics are read-only here. Approximate placement is never presented as a physical lock.')}</p>
      </div>
      <p className="readOnlyNotice">{t('Anchor diagnostics in this batch of {count} posts. Use Next records to inspect older posts, including when this batch has no anchors.', { count: page.documents.length })}</p>
      <section className="panel">
        <div className="dataRow anchor header"><span>{t('Post')}</span><span>{t('Provider')}</span><span>{t('Placement')}</span><span>{t('Resolvers')}</span><span>{t('Updated')}</span></div>
        {failed ? <p className="emptyState">{t('Anchor diagnostics could not be loaded.')}</p> : anchors.length === 0 ? <p className="emptyState">{t('No anchor records.')}</p> : anchors.map(anchor => {
          const bundleKeys = objectKeys(parseJsonField(anchor.anchor_bundle_json));
          const placement = String(anchor.placement_state);
          return (
            <div className="dataRow anchor" key={anchor.id}>
              <span><b>{scalarText(anchor.caption || t('Untitled post'))}</b><small>{anchor.id} · {String(anchor.status)}</small></span>
              <span>{scalarText(anchor.native_provider ?? t('unknown'))}</span>
              <span><i className={`statusDot ${placement === 'arkit_world_locked' ? 'active' : 'flagged'}`} />{placement.replaceAll('_', ' ')}<small>{t('Quality')} {anchor.placement_quality == null ? t('unmeasured') : Number(anchor.placement_quality).toFixed(2)}</small></span>
              <span>{(anchor.resolver_strategy as string[] | null)?.join(' → ') || t('No resolver strategy')}<small>{t('Assets')}: {bundleKeys.join(', ') || t('none recorded')}{anchor.multi_user_ready ? ` · ${t('world map stored')}` : ''}</small></span>
              <span>{new Date(iso(anchor.updated_at ?? anchor.created_at)).toLocaleString(locale)}</span>
            </div>
          );
        })}
        {!failed ? <PageNavigation path="/admin/anchors" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/anchors">{t('Return to the first page.')}</a></p>}
      </section>
    </section>
  );
}
