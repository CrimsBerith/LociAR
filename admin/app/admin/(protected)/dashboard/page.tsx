import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso, isoOrNull } from '../../../../lib/firebase-admin';
import { getI18n } from '../../../../lib/i18n-server';

export const dynamic = 'force-dynamic';

function Metric({ label, value, detail, missing }: { label: string; value: number | null; detail?: string; missing: string }) {
  return (
    <article className="metricCard">
      <span>{label}</span>
      {value === null ? <strong className="notInstrumented">{missing}</strong> : <strong>{value.toLocaleString()}</strong>}
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export default async function AdminDashboard() {
  await requireAdmin({ permission: 'dashboard.read' });
  const { t, locale } = await getI18n();
  const missing = t('Not instrumented');
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
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">{t('Operations overview')}</p><h1>{t('Dashboard')}</h1></div>
        <p className="muted">{t('Live production data. Missing telemetry is explicitly marked.')}</p>
      </div>

      <section className="metricGrid" aria-label={t('Key performance indicators')}>
        <Metric missing={missing} label={t('Users')} value={users.data().count} />
        <Metric missing={missing} label={t('Active posts')} value={active.data().count} />
        <Metric missing={missing} label={t('Pending review')} value={pending.data().count} />
        <Metric missing={missing} label={t('Trash')} value={removed.data().count} />
        <Metric missing={missing} label={t('Open reports')} value={openReports.data().count} detail={t('In-app report queue')} />
        <Metric missing={missing} label={t('AR resolve success')} value={null} />
        <Metric missing={missing} label={t('Crash-free sessions')} value={null} />
        <Metric missing={missing} label={t('API error rate')} value={null} />
      </section>

      <div className="dashboardGrid">
        <section className="panel">
          <div className="panelHeader"><div><p className="eyebrow">{t('Content')}</p><h2>{t('Recent posts')}</h2></div><a href="/admin/posts">{t('View all')}</a></div>
          <div className="dataTable" role="table">
            <div className="dataRow header" role="row">
              <span>{t('Post')}</span><span>{t('Status')}</span><span>{t('Engagement')}</span><span>{t('Created')}</span>
            </div>
            {postRows.length === 0 ? <p className="emptyState">{t('No posts found.')}</p> : postRows.map(post => (
              <div className="dataRow" role="row" key={post.id}>
                <span><b>{String(post.caption || t('Untitled post'))}</b><small>{String(post.age_rating)}</small></span>
                <span><i className={`statusDot ${String(post.status)}`} />{t(String(post.status).replaceAll('_', ' '))}</span>
                <span>{Number(post.views_count ?? 0)} / {Number(post.likes_count ?? 0)} / {Number(post.comments_count ?? 0)}{isoOrNull(post.metrics_admin_edited_at) ? <small>{t('Admin edited')}</small> : null}</span>
                <span>{new Date(iso(post.created_at)).toLocaleDateString(locale)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader"><div><p className="eyebrow">{t('Accountability')}</p><h2>{t('Recent audit')}</h2></div><a href="/admin/audit">{t('Open log')}</a></div>
          <div className="auditList">
            {audit.empty ? <p className="emptyState">{t('No audit events found.')}</p> : audit.docs.map(doc => {
              const event = doc.data();
              return (
                <article key={doc.id}>
                  <span className="auditIcon">↗</span>
                  <div><b>{t(String(event.action).replaceAll('_', ' '))}</b><small>{String(event.resource_type)} · {String(event.resource_id ?? 'system')}</small></div>
                  <time>{new Date(iso(event.created_at)).toLocaleString(locale)}</time>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
