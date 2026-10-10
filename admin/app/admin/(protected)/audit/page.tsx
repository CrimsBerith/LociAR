import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'audit.read' });
  let events: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    page = await readDocumentPage(adminDb().collection('admin_audit_log'), { scope: 'audit', cursors: pageCursors(params) });
    events = page.documents.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    failed = true;
  }
  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Append-only history</p><h1>Audit logs</h1></div>
        <p className="muted">Clients cannot read or write audit rows (Security Rules). The panel only ever creates new entries.</p>
      </div>
      <section className="panel">
        {failed ? <p className="emptyState">Audit data could not be loaded.</p> : (
          <div className="dataTable">
            <div className="dataRow audit header"><span>Action</span><span>Actor</span><span>Resource</span><span>Time</span></div>
            {events.length === 0 ? <p className="emptyState">No audit events.</p> : events.map(event => (
              <div className="dataRow audit" key={event.id}>
                <span><b>{String(event.action).replaceAll('_', ' ')}</b><small>{String(event.permission_key ?? 'legacy')} · {String(event.risk_level)}</small></span>
                <span>{String(event.actor_id)}</span>
                <span>{String(event.resource_type)} · {String(event.resource_id ?? 'system')}<small>{String(event.reason ?? 'No reason recorded')}</small></span>
                <span>{new Date(iso(event.created_at)).toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        )}
        {!failed ? <PageNavigation path="/admin/audit" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/audit">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
