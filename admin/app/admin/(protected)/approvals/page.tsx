import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import ApprovalActions from './ApprovalActions';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const admin = await requireAdmin({ permission: 'posts.metrics.write' });
  let approvals: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const snap = await adminDb().collection('admin_approval_requests')
      .where('status', '==', 'pending')
      .orderBy('created_at', 'asc')
      .limit(100)
      .get();
    approvals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    failed = true;
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Four-eyes control</p><h1>Pending approvals</h1></div>
        <p className="muted">You cannot approve your own request. Changed targets are invalidated before execution.</p>
      </div>
      <section className="panel">
        {failed ? <p className="emptyState">Approval data could not be loaded.</p> : (
          <div className="dataTable">
            <div className="dataRow post header">
              <span>Action</span><span>Target</span><span>Requested values</span><span>Reason / expiry</span><span>Decision</span>
            </div>
            {approvals.length === 0 ? <p className="emptyState">No pending approvals.</p> : approvals.map(approval => {
              const isOwnRequest = approval.requested_by === admin.user.id;
              const payload = (approval.payload ?? {}) as Record<string, unknown>;
              return (
                <div className="dataRow post" key={approval.id}>
                  <span><b>{String(approval.action).replaceAll('_', ' ')}</b><small>{approval.id}</small></span>
                  <span>{String(approval.resource_type)}<small>{String(approval.resource_id ?? 'global')}</small></span>
                  <span>{String(payload.viewsCount ?? '—')} / {String(payload.likesCount ?? '—')} / {String(payload.commentsCount ?? '—')}</span>
                  <span>{String(approval.reason)}<small>Expires {new Date(iso(approval.expires_at)).toLocaleString('en-US')}</small></span>
                  <span>{isOwnRequest ? <small>Independent admin required</small> : <ApprovalActions approvalId={approval.id} />}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
