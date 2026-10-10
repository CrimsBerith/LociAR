import { recordPersonalDataRead } from '../../../../lib/ops';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb } from '../../../../lib/firebase-admin';
import { InvalidCursorError, pageCursors, readCaptionPage, readDocumentPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';
import PageNavigation from '../PageNavigation';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { id: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const admin = await requireAdmin({ permission: 'dashboard.read' });
  const params = await searchParams;
  const term = textParameter(params.q);
  const needle = term.toLowerCase();
  let users: Row[] = [];
  let posts: Row[] = [];
  let userPage: DocumentPage = { documents: [], next: null, previous: null };
  let postPage: DocumentPage = { documents: [], next: null, previous: null };
  let failed = false;
  let invalid = false;
  if (term) {
    try {
      const db = adminDb();
      const handle = needle.replace(/^@/, '');
      const userCursors = pageCursors(params, 'users');
      const postCursors = pageCursors(params, 'posts');
      const [loadedUsers, loadedPosts, byId] = await Promise.all([
        readDocumentPage(db.collection('profiles').where('handle', '>=', handle).where('handle', '<=', handle + '\uf8ff'), {
          field: 'handle', direction: 'asc', scope: JSON.stringify(['search-users', handle]), cursors: userCursors, size: 25,
        }),
        readCaptionPage(db.collection('posts'), { scope: JSON.stringify(['search-posts', needle]), cursors: postCursors, size: 250, needle }),
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(needle) ? db.collection('posts').doc(needle).get() : Promise.resolve(null),
      ]);
      await recordPersonalDataRead(admin.user.id, 'search_profiles', loadedUsers.documents.length);
      userPage = loadedUsers;
      postPage = loadedPosts;
      users = userPage.documents.map(d => ({ ...d.data(), id: d.id }));
      posts = loadedPosts.matches.map(d => ({ ...d.data(), id: d.id }) as Row);
      if (byId?.exists) posts = [{ ...byId.data(), id: byId.id }, ...posts.filter(p => p.id !== byId.id)];
    } catch (error) {
      failed = true;
      invalid = error instanceof InvalidCursorError;
    }
  }
  const anchors = posts.filter(p => p.placement_state);
  const parameters = {
    q: term,
    usersAfter: textParameter(params.usersAfter, 4096), usersBefore: textParameter(params.usersBefore, 4096),
    postsAfter: textParameter(params.postsAfter, 4096), postsBefore: textParameter(params.postsBefore, 4096),
  };

  return (
    <section className="page">
      <div className="pageHeading"><div><p className="eyebrow">Inventory lookup</p><h1>Search</h1></div><p className="muted">Users (handle prefix), posts (caption or exact ID) and AR anchor diagnostics.</p></div>
      <p className="queryEcho">{term ? `Results for “${term}”` : 'Enter a search term in the top bar.'}</p>
      {invalid ? <p className="emptyState">Invalid page link. <a href={`/admin/search?${new URLSearchParams({ q: term })}`}>Restart this search.</a></p> : null}
      {term && !failed ? <p className="readOnlyNotice">Caption and anchor matches in this batch of {postPage.documents.length} posts. {postPage.next ? 'Continue searching older records to scan the remaining posts, even when this batch has no matches.' : 'There are no older posts after this batch.'} Exact post IDs are looked up directly.</p> : null}
      <section className="dashboardGrid">
        <div className="stack">
          <section className="panel"><div className="panelHeader"><h2>Users</h2></div>{failed ? <p className="emptyState">User search failed.</p> : users.length === 0 ? <p className="emptyState">No users in this page.</p> : users.map(user => <div className="dataRow" key={user.id}><span><b>@{String(user.handle)}</b><small>{user.id}</small></span><span>{user.suspended ? 'Suspended' : 'Active'}</span></div>)}{!failed ? <PageNavigation path="/admin/search" parameters={parameters} prefix="users" next={userPage.next} previous={userPage.previous} /> : null}</section>
          <section className="panel"><div className="panelHeader"><h2>Posts</h2></div>{failed ? <p className="emptyState">Post search failed.</p> : posts.length === 0 ? <p className="emptyState">No matching posts in this batch.</p> : posts.map(post => <div className="dataRow" key={post.id}><span><b>{String(post.caption || 'Untitled post')}</b><small>{post.id}</small></span><span>{post.deleted_at ? 'trash' : String(post.status)}</span></div>)}{!failed ? <PageNavigation path="/admin/search" parameters={parameters} prefix="posts" next={postPage.next} previous={postPage.previous} scan /> : null}</section>
        </div>
        <section className="panel"><div className="panelHeader"><h2>AR anchors</h2></div>{failed ? <p className="emptyState">Anchor search failed.</p> : anchors.length === 0 ? <p className="emptyState">No matching anchors in this batch.</p> : anchors.map(anchor => <div className="auditList" key={anchor.id}><article><span className="auditIcon">⌖</span><div><b>{String(anchor.caption || 'Untitled post')}</b><small>{String(anchor.native_provider)} · {String(anchor.placement_state)} · quality {anchor.placement_quality == null ? 'unmeasured' : Number(anchor.placement_quality).toFixed(2)}</small></div></article></div>)}</section>
      </section>
    </section>
  );
}
