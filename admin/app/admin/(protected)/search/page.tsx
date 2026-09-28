import { requireAdmin } from '../../../../lib/admin';
import { adminDb } from '../../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { id: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin({ permission: 'dashboard.read' });
  const { q = '' } = await searchParams;
  const term = q.trim().slice(0, 120);
  const needle = term.toLowerCase();
  let users: Row[] = [];
  let posts: Row[] = [];
  let failed = false;
  if (term) {
    try {
      const db = adminDb();
      const handle = needle.replace(/^@/, '');
      const [userSnap, postSnap, byId] = await Promise.all([
        db.collection('profiles').orderBy('handle').startAt(handle).endAt(handle + '').limit(25).get(),
        db.collection('posts').orderBy('created_at', 'desc').limit(500).get(),
        /^[0-9a-f-]{36}$/.test(needle) ? db.collection('posts').doc(needle).get() : Promise.resolve(null),
      ]);
      users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      posts = postSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Row).filter(p => String(p.caption ?? '').toLowerCase().includes(needle));
      if (byId?.exists) posts = [{ id: byId.id, ...byId.data() }, ...posts.filter(p => p.id !== byId.id)];
      posts = posts.slice(0, 25);
    } catch {
      failed = true;
    }
  }
  const anchors = posts.filter(p => p.placement_state);

  return (
    <main className="page">
      <div className="pageHeading"><div><p className="eyebrow">Global lookup</p><h1>Search</h1></div><p className="muted">Users (handle prefix), posts (caption or ID) and AR anchor diagnostics.</p></div>
      <p className="queryEcho">{term ? `Results for “${term}”` : 'Enter a search term in the top bar.'}</p>
      <section className="dashboardGrid">
        <div className="stack">
          <section className="panel"><div className="panelHeader"><h2>Users</h2></div>{failed ? <p className="emptyState">User search failed.</p> : users.length === 0 ? <p className="emptyState">No users.</p> : users.map(user => <div className="dataRow" key={user.id}><span><b>@{String(user.handle)}</b><small>{user.id}</small></span><span>{user.suspended ? 'Suspended' : 'Active'}</span></div>)}</section>
          <section className="panel"><div className="panelHeader"><h2>Posts</h2></div>{failed ? <p className="emptyState">Post search failed.</p> : posts.length === 0 ? <p className="emptyState">No posts.</p> : posts.map(post => <div className="dataRow" key={post.id}><span><b>{String(post.caption || 'Untitled post')}</b><small>{post.id}</small></span><span>{post.deleted_at ? 'trash' : String(post.status)}</span></div>)}</section>
        </div>
        <section className="panel"><div className="panelHeader"><h2>AR anchors</h2></div>{failed ? <p className="emptyState">Anchor search failed.</p> : anchors.length === 0 ? <p className="emptyState">No anchors.</p> : anchors.map(anchor => <div className="auditList" key={anchor.id}><article><span className="auditIcon">⌖</span><div><b>{String(anchor.caption || 'Untitled post')}</b><small>{String(anchor.native_provider)} · {String(anchor.placement_state)} · quality {anchor.placement_quality == null ? 'unmeasured' : Number(anchor.placement_quality).toFixed(2)}</small></div></article></div>)}</section>
      </section>
    </main>
  );
}
