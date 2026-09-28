import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireAdmin({ permission: 'audit.read' });
  let events: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const snap = await adminDb().collection('admin_audit_log').orderBy('created_at', 'desc').limit(200).get();
    events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    failed = true;
  }
  return (
    <main className="page">
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
      </section>
    </main>
  );
}
