import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';
import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function PlacesPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await requireAdmin({ permission: 'anchors.read' });
  const params = await searchParams;
  let postPage: DocumentPage = { documents: [], next: null, previous: null };
  let locationPage: DocumentPage = { documents: [], next: null, previous: null };
  const db = adminDb();
  let posts: Array<Record<string, unknown> & { id: string }> = [];
  let locations: Array<Record<string, unknown> & { id: string }> = [];
  let postError = false;
  let locationError = false;
  await Promise.all([
    Promise.resolve().then(() => readDocumentPage(db.collection('posts'), { scope: 'places-posts', cursors: pageCursors(params, 'posts') }))
      .then(page => { postPage = page; posts = page.documents.map(d => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string }).filter(p => !p.deleted_at); })
      .catch(() => { postError = true; }),
    Promise.resolve().then(() => readDocumentPage(db.collection('campaign_locations'), { scope: 'places-campaigns', cursors: pageCursors(params, 'locations') }))
      .then(page => { locationPage = page; locations = page.documents.map(d => ({ ...d.data(), id: d.id })); })
      .catch(() => { locationError = true; }),
  ]);
  const parameters = {
    postsAfter: textParameter(params.postsAfter, 4096), postsBefore: textParameter(params.postsBefore, 4096),
    locationsAfter: textParameter(params.locationsAfter, 4096), locationsBefore: textParameter(params.locationsBefore, 4096),
  };

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Location inventory</p><h1>Map & places</h1></div>
        <p className="muted">Read-only production view of post and campaign coordinates. No location mutation is available.</p>
      </div>
      <section className="panel">
        <div className="panelHeader"><h2>Post locations</h2></div>
        {!postError ? <p className="readOnlyNotice">Locations in this batch of {postPage.documents.length} posts. Next records continues through older posts even when this batch contains only deleted posts.</p> : null}
        <div className="dataRow place header"><span>Post</span><span>Coordinate</span><span>Placement</span><span>Created</span></div>
        {postError ? <p className="emptyState">Post locations could not be loaded.</p> : posts.length === 0 ? <p className="emptyState">No post locations.</p> : posts.map(post => (
          <div className="dataRow place" key={post.id}>
            <span><b>{String(post.caption || 'Untitled post')}</b><small>{post.id} · {String(post.status)}</small></span>
            <span>{formatLatLng(post.lat, post.lng)}<small>{String(post.geohash ?? '').slice(0, 7) || 'no geohash'}</small></span>
            <span>{String(post.placement_state ?? 'unknown').replaceAll('_', ' ')}</span>
            <span>{new Date(iso(post.created_at)).toLocaleDateString('en-US')}</span>
          </div>
        ))}
        {!postError ? <PageNavigation path="/admin/places" parameters={parameters} prefix="posts" next={postPage.next} previous={postPage.previous} /> : <p className="emptyState"><a href="/admin/places">Return to the first page.</a></p>}
      </section>
      <section className="panel actionPanel">
        <div className="panelHeader"><h2>Campaign locations</h2></div>
        <div className="dataRow place header"><span>Campaign / label</span><span>Coordinate</span><span>Status</span><span>Created</span></div>
        {locationError ? <p className="emptyState">Campaign locations could not be loaded.</p> : locations.length === 0 ? <p className="emptyState">No campaign locations.</p> : locations.map(location => (
          <div className="dataRow place" key={location.id}>
            <span><b>{String(location.campaign_name ?? 'Unassigned campaign')}</b><small>{String(location.label ?? location.id)}</small></span>
            <span>{formatLatLng(location.latitude, location.longitude)}</span>
            <span>{String(location.status ?? 'unknown')}</span>
            <span>{new Date(iso(location.created_at)).toLocaleDateString('en-US')}</span>
          </div>
        ))}
        {!locationError ? <PageNavigation path="/admin/places" parameters={parameters} prefix="locations" next={locationPage.next} previous={locationPage.previous} /> : <p className="emptyState"><a href="/admin/places">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
