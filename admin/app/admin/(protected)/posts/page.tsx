import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso, isoOrNull } from '../../../../lib/firebase-admin';
import PostActions from './PostActions';
import PostContentPreview from './PostContentPreview';

export const dynamic = 'force-dynamic';

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin({ permission: 'posts.read' });
  const { status = 'all', q = '' } = await searchParams;
  const term = q.trim().toLowerCase().slice(0, 120);
  let posts: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  try {
    const collection = adminDb().collection('posts');
    const statusFilter = status === 'trash' ? 'removed' : status;
    const query = status === 'all'
      ? collection.orderBy('created_at', 'desc').limit(term ? 300 : 100)
      : collection.where('status', '==', statusFilter).orderBy('created_at', 'desc').limit(term ? 300 : 100);
    const snap = await query.get();
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (term) posts = posts.filter(p => String(p.caption ?? '').toLowerCase().includes(term)).slice(0, 100);
  } catch {
    failed = true;
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Content operations</p><h1>Posts & media</h1></div>
        <p className="muted">All destructive actions require a reason and are written to the audit log.</p>
      </div>
      <section className="panel">
        <div className="panelHeader">
          <form method="get" className="filterBar">
            <input name="q" defaultValue={q} placeholder="Search captions" aria-label="Search post captions" />
            <select name="status" defaultValue={status} aria-label="Filter by post status">
              <option value="all">All</option>
              <option value="pending_review">Pending review</option>
              <option value="active">Active</option>
              <option value="flagged">Flagged</option>
              <option value="trash">Trash</option>
            </select>
            <button>Apply</button>
          </form>
        </div>
        {failed ? <p className="emptyState">Post data could not be loaded.</p> : (
          <div className="dataTable">
            <div className="dataRow post header"><span>Post</span><span>Status</span><span>Visibility</span><span>Views / likes / comments</span><span>Actions</span></div>
            {posts.length === 0 ? <p className="emptyState">No matching posts.</p> : posts.map(post => {
              const deleted = Boolean(post.deleted_at);
              return (
                <div className="dataRow post" key={post.id}>
                  <span><b>{String(post.caption || 'Untitled post')}</b><small>{post.id} · @{String(post.creator_handle ?? '')} · {new Date(iso(post.created_at)).toLocaleDateString('en-US')}</small><PostContentPreview post={post} /></span>
                  <span><i className={`statusDot ${String(post.status)}`} />{deleted ? 'trash' : String(post.status).replaceAll('_', ' ')}</span>
                  <span>{String(post.visibility)} · {String(post.age_rating)}</span>
                  <span>{Number(post.views_count ?? 0)} / {Number(post.likes_count ?? 0)} / {Number(post.comments_count ?? 0)}{isoOrNull(post.metrics_admin_edited_at) ? <small>Admin edited</small> : null}</span>
                  <span><PostActions postId={post.id} status={String(post.status)} deleted={deleted} views={Number(post.views_count ?? 0)} likes={Number(post.likes_count ?? 0)} comments={Number(post.comments_count ?? 0)} /></span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
