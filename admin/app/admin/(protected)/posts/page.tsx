import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso, isoOrNull } from '../../../../lib/firebase-admin';
import PostActions from './PostActions';
import PageNavigation from '../PageNavigation';
import { InvalidCursorError, pageCursors, readCaptionPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function PostsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const admin = await requireAdmin({ permission: 'posts.read' });
  const params = await searchParams;
  const q = textParameter(params.q);
  const requestedStatus = textParameter(params.status, 30);
  const status = ['pending_review', 'active', 'flagged', 'trash'].includes(requestedStatus) ? requestedStatus : 'all';
  const term = q.toLowerCase();
  let page: DocumentPage = { documents: [], next: null, previous: null };
  let posts: Array<Record<string, unknown> & { id: string }> = [];
  let failed = false;
  let invalid = false;
  try {
    const collection = adminDb().collection('posts');
    const statusFilter = status === 'trash' ? 'removed' : status;
    const query = status === 'all' ? collection : collection.where('status', '==', statusFilter);
    const loaded = await readCaptionPage(query, { scope: JSON.stringify(['posts', status, term]), cursors: pageCursors(params), needle: term });
    page = loaded;
    posts = loaded.matches.map(d => ({ ...d.data(), id: d.id }));
  } catch (error) {
    failed = true;
    invalid = error instanceof InvalidCursorError;
  }

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Content operations</p><h1>Posts & media</h1>{admin.permissions.has('posts.create') ? <a className="button" href="/admin/posts/new">Create post</a> : null}</div>
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
        {term && !failed ? <p className="readOnlyNotice">Caption matches in this batch of {page.documents.length} records. Continue searching older records to scan the remaining posts.</p> : null}
        {failed ? <p className="emptyState">{invalid ? <>Invalid page link. <a href={`/admin/posts?${new URLSearchParams({ q, status })}`}>Return to the first page.</a></> : 'Post data could not be loaded.'}</p> : (
          <div className="dataTable">
            <div className="dataRow post header"><span>Post</span><span>Status</span><span>Visibility</span><span>Views / likes / comments</span><span>Actions</span></div>
            {posts.length === 0 ? <p className="emptyState">No matching posts.</p> : posts.map(post => {
              const deleted = Boolean(post.deleted_at);
              return (
                <div className="dataRow post" key={post.id}>
                  <span><a href={`/admin/posts/${post.id}`}><b>{String(post.caption || 'Untitled post')}</b></a><small>{post.id} · @{String(post.creator_handle ?? '')} · {new Date(iso(post.created_at)).toLocaleDateString('en-US')}</small></span>
                  <span><i className={`statusDot ${String(post.status)}`} />{deleted ? 'trash' : String(post.status).replaceAll('_', ' ')}</span>
                  <span>{String(post.visibility)} · {String(post.age_rating)}</span>
                  <span>{Number(post.views_count ?? 0)} / {Number(post.likes_count ?? 0)} / {Number(post.comments_count ?? 0)}{isoOrNull(post.metrics_admin_edited_at) ? <small>Admin edited</small> : null}</span>
                  <span><PostActions postId={post.id} status={String(post.status)} deleted={deleted} views={Number(post.views_count ?? 0)} likes={Number(post.likes_count ?? 0)} comments={Number(post.comments_count ?? 0)} /></span>
                </div>
              );
            })}
          </div>
        )}
        {!failed ? <PageNavigation path="/admin/posts" parameters={{ q, status }} next={page.next} previous={page.previous} scan={Boolean(term)} /> : null}
      </section>
    </section>
  );
}
