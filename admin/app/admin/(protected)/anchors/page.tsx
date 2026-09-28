import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { objectKeys, parseJsonField } from '../../../../lib/geo';

export const dynamic = 'force-dynamic';

export default async function AnchorsPage() {
  await requireAdmin({ permission: 'anchors.read' });
  let anchors: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const snap = await adminDb().collection('posts').orderBy('created_at', 'desc').limit(200).get();
    anchors = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string }).filter(p => p.placement_state && !p.deleted_at).slice(0, 100);
  } catch {
    failed = true;
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Spatial operations</p><h1>AR anchors</h1></div>
        <p className="muted">Resolver and persistence diagnostics are read-only here. Approximate placement is never presented as a physical lock.</p>
      </div>
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
      </section>
    </main>
  );
}
