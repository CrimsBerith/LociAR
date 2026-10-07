import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import ApprovalActions from './ApprovalActions';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  const admin = await requireAdmin({ permission: 'posts.metrics.write' });
  let approvals: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    page = await readDocumentPage(adminDb().collection('admin_approval_requests').where('status', '==', 'pending'), { direction: 'asc', scope: 'approvals-pending', cursors: pageCursors(params) });
    approvals = page.documents.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    failed = true;
  }

  return (
    <section className="page">
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
        {!failed ? <PageNavigation path="/admin/approvals" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/approvals">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
