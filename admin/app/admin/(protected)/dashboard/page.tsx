import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso, isoOrNull } from '../../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';

function Metric({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  return (
    <article className="metricCard">
      <span>{label}</span>
      {value === null ? <strong className="notInstrumented">Not instrumented</strong> : <strong>{value.toLocaleString()}</strong>}
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export default async function AdminDashboard() {
  await requireAdmin({ permission: 'dashboard.read' });
  const db = adminDb();
  const posts = db.collection('posts');
  const [users, pending, active, removed, openReports, recentPosts, audit] = await Promise.all([
    db.collection('profiles').count().get(),
    posts.where('status', '==', 'pending_review').count().get(),
    posts.where('status', '==', 'active').count().get(),
    posts.where('status', '==', 'removed').count().get(),
    db.collection('moderation_flags').where('status', '==', 'open').count().get(),
    posts.orderBy('created_at', 'desc').limit(20).get(),
    db.collection('admin_audit_log').orderBy('created_at', 'desc').limit(8).get(),
  ]);

  const postRows = recentPosts.docs
    .map(d => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
    .filter(p => !p.deleted_at)
    .slice(0, 8);
  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Operations overview</p><h1>Dashboard</h1></div>
        <p className="muted">Live production data. Missing telemetry is explicitly marked.</p>
      </div>

      <section className="metricGrid" aria-label="Key performance indicators">
        <Metric label="Users" value={users.data().count} />
        <Metric label="Active posts" value={active.data().count} />
        <Metric label="Pending review" value={pending.data().count} />
        <Metric label="Trash" value={removed.data().count} />
        <Metric label="Open reports" value={openReports.data().count} detail="In-app report queue" />
        <Metric label="AR resolve success" value={null} />
        <Metric label="Crash-free sessions" value={null} />
        <Metric label="API error rate" value={null} />
      </section>

      <div className="dashboardGrid">
        <section className="panel">
          <div className="panelHeader"><div><p className="eyebrow">Content</p><h2>Recent posts</h2></div><a href="/admin/posts">View all</a></div>
          <div className="dataTable" role="table">
            <div className="dataRow header" role="row">
              <span>Post</span><span>Status</span><span>Engagement</span><span>Created</span>
            </div>
            {postRows.length === 0 ? <p className="emptyState">No posts found.</p> : postRows.map(post => (
              <div className="dataRow" role="row" key={post.id}>
                <span><b>{String(post.caption || 'Untitled post')}</b><small>{String(post.age_rating)}</small></span>
                <span><i className={`statusDot ${String(post.status)}`} />{String(post.status).replaceAll('_', ' ')}</span>
                <span>{Number(post.views_count ?? 0)} / {Number(post.likes_count ?? 0)} / {Number(post.comments_count ?? 0)}{isoOrNull(post.metrics_admin_edited_at) ? <small>Admin edited</small> : null}</span>
                <span>{new Date(iso(post.created_at)).toLocaleDateString('en-US')}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader"><div><p className="eyebrow">Accountability</p><h2>Recent audit</h2></div><a href="/admin/audit">Open log</a></div>
          <div className="auditList">
            {audit.empty ? <p className="emptyState">No audit events found.</p> : audit.docs.map(doc => {
              const event = doc.data();
              return (
                <article key={doc.id}>
                  <span className="auditIcon">↗</span>
                  <div><b>{String(event.action).replaceAll('_', ' ')}</b><small>{String(event.resource_type)} · {String(event.resource_id ?? 'system')}</small></div>
                  <time>{new Date(iso(event.created_at)).toLocaleString('en-US')}</time>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
