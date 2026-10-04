import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';

export const dynamic = 'force-dynamic';

export default async function PlacesPage() {
  await requireAdmin({ permission: 'anchors.read' });
  const db = adminDb();
  let posts: Array<Record<string, unknown> & { id: string }> = [];
  let postError = false;
  await Promise.all([
    db.collection('posts').orderBy('created_at', 'desc').limit(150).get()
      .then(snap => { posts = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string }).filter(p => !p.deleted_at).slice(0, 100); })
      .catch(() => { postError = true; }),
  ]);

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Location inventory</p><h1>Map & places</h1></div>
        <p className="muted">Read-only view of recent post coordinates.</p>
      </div>
      <section className="panel">
        <div className="panelHeader"><h2>Post locations</h2></div>
        <div className="dataRow place header"><span>Post</span><span>Coordinate</span><span>Placement</span><span>Created</span></div>
        {postError ? <p className="emptyState">Post locations could not be loaded.</p> : posts.length === 0 ? <p className="emptyState">No post locations.</p> : posts.map(post => (
          <div className="dataRow place" key={post.id}>
            <span><b>{String(post.caption || 'Untitled post')}</b><small>{post.id} · {String(post.status)}</small></span>
            <span>{formatLatLng(post.lat, post.lng)}<small>{String(post.geohash ?? '').slice(0, 7) || 'no geohash'}</small></span>
            <span>{String(post.placement_state ?? 'unknown').replaceAll('_', ' ')}</span>
            <span>{new Date(iso(post.created_at)).toLocaleDateString('en-US')}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
