import { scalarText } from '../../../../lib/values';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso, isoOrNull } from '../../../../lib/firebase-admin';
import PostActions from './PostActions';
import { getI18n } from '../../../../lib/i18n-server';
import PageNavigation from '../PageNavigation';
import { InvalidCursorError, pageCursors, readCaptionPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function PostsPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const admin = await requireAdmin({ permission: 'posts.read' });
  const { t, locale } = await getI18n();
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
    let query: FirebaseFirestore.Query = status === 'all' ? collection : collection.where('status', '==', statusFilter);
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
        <div><p className="eyebrow">{t('Content operations')}</p><h1>{t('Posts & media')}</h1>{admin.permissions.has('posts.create') ? <a className="button" href="/admin/posts/new">{t('Create post')}</a> : null}</div>
        <p className="muted">{t('All destructive actions require a reason and are written to the audit log.')}</p>
      </div>
      <section className="panel">
        <div className="panelHeader">
          <form method="get" className="filterBar">
            <input name="q" defaultValue={q} placeholder={t('Search captions')} aria-label={t('Search post captions')} />
            <select name="status" defaultValue={status} aria-label={t('Filter by post status')}>
              <option value="all">{t('All')}</option>
              <option value="pending_review">{t('Pending review')}</option>
              <option value="active">{t('Active')}</option>
              <option value="flagged">{t('Flagged')}</option>
              <option value="trash">{t('Trash')}</option>
            </select>
            <button type="submit">{t('Apply')}</button>
          </form>
        </div>
        {term && !failed ? <p className="readOnlyNotice">{t('Caption matches in this batch of {count} records. Continue searching older records to scan the remaining posts.', { count: page.documents.length })}</p> : null}
        {failed ? <p className="emptyState">{invalid ? <>{t('Invalid page link.')} <a href={`/admin/posts?${new URLSearchParams({ q, status })}`}>{t('Return to the first page.')}</a></> : t('Post data could not be loaded.')}</p> : (
          <div className="dataTable">
            <div className="dataRow post header"><span>{t('Post')}</span><span>{t('Status')}</span><span>{t('Visibility')}</span><span>{t('Views / likes / comments')}</span><span>{t('Actions')}</span></div>
            {posts.length === 0 ? <p className="emptyState">{t('No matching posts.')}</p> : posts.map(post => {
              const deleted = Boolean(post.deleted_at);
              return (
                <div className="dataRow post" key={post.id}>
                  <span><a href={`/admin/posts/${post.id}`}><b>{scalarText(post.caption || t('Untitled post'))}</b></a><small>{post.id} · @{scalarText(post.creator_handle ?? '')} · {new Date(iso(post.created_at)).toLocaleDateString(locale)}</small></span>
                  <span><i className={`statusDot ${String(post.status)}`} />{deleted ? t('trash') : t(String(post.status).replaceAll('_', ' '))}</span>
                  <span>{t(String(post.visibility))} · {String(post.age_rating)}</span>
                  <span>{Number(post.views_count ?? 0)} / {Number(post.likes_count ?? 0)} / {Number(post.comments_count ?? 0)}{isoOrNull(post.metrics_admin_edited_at) ? <small>{t('Admin edited')}</small> : null}</span>
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
