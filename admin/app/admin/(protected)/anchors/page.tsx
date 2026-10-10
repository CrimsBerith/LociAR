import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { objectKeys, parseJsonField } from '../../../../lib/geo';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function AnchorsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'anchors.read' });
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
        <div><p className="eyebrow">Spatial operations</p><h1>AR anchors</h1></div>
        <p className="muted">Resolver and persistence diagnostics are read-only here. Approximate placement is never presented as a physical lock.</p>
      </div>
      <p className="readOnlyNotice">Anchor diagnostics in this batch of {page.documents.length} posts. Use Next records to inspect older posts, including when this batch has no anchors.</p>
      <section className="panel">
        <div className="dataRow anchor header"><span>Post</span><span>Provider</span><span>Placement</span><span>Resolvers</span><span>Updated</span></div>
        {failed ? <p className="emptyState">Anchor diagnostics could not be loaded.</p> : anchors.length === 0 ? <p className="emptyState">No anchor records.</p> : anchors.map(anchor => {
          const bundleKeys = objectKeys(parseJsonField(anchor.anchor_bundle_json));
          const placement = String(anchor.placement_state);
          return (
            <div className="dataRow anchor" key={anchor.id}>
              <span><b>{String(anchor.caption || 'Untitled post')}</b><small>{anchor.id} · {String(anchor.status)}</small></span>
              <span>{String(anchor.native_provider ?? 'unknown')}</span>
              <span><i className={`statusDot ${placement === 'arkit_world_locked' ? 'active' : 'flagged'}`} />{placement.replaceAll('_', ' ')}<small>Quality {anchor.placement_quality == null ? 'unmeasured' : Number(anchor.placement_quality).toFixed(2)}</small></span>
              <span>{(anchor.resolver_strategy as string[] | null)?.join(' → ') || 'No resolver strategy'}<small>Assets: {bundleKeys.join(', ') || 'none recorded'}{anchor.multi_user_ready ? ' · world map stored' : ''}</small></span>
              <span>{new Date(iso(anchor.updated_at ?? anchor.created_at)).toLocaleString('en-US')}</span>
            </div>
          );
        })}
        {!failed ? <PageNavigation path="/admin/anchors" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/anchors">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
