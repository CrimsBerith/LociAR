import { scalarText } from '../../../../lib/values';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { formatLatLng } from '../../../../lib/geo';
import { getI18n } from '../../../../lib/i18n-server';
import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, textParameter, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function PlacesPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  await requireAdmin({ permission: 'anchors.read' });
  const { t, locale } = await getI18n();
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
        <div><p className="eyebrow">{t('Location inventory')}</p><h1>{t('Map & places')}</h1></div>
        <p className="muted">{t('Read-only production view of post and campaign coordinates. No location mutation is available.')}</p>
      </div>
      <section className="panel">
        <div className="panelHeader"><h2>{t('Post locations')}</h2></div>
        {!postError ? <p className="readOnlyNotice">{t('Locations in this batch of {count} posts. Next records continues through older posts even when this batch contains only deleted posts.', { count: postPage.documents.length })}</p> : null}
        <div className="dataRow place header"><span>{t('Post')}</span><span>{t('Coordinate')}</span><span>{t('Placement')}</span><span>{t('Created')}</span></div>
        {postError ? <p className="emptyState">{t('Post locations could not be loaded.')}</p> : posts.length === 0 ? <p className="emptyState">{t('No post locations.')}</p> : posts.map(post => (
          <div className="dataRow place" key={post.id}>
            <span><b>{scalarText(post.caption || t('Untitled post'))}</b><small>{post.id} · {String(post.status)}</small></span>
            <span>{formatLatLng(post.lat, post.lng)}<small>{scalarText(post.geohash ?? '').slice(0, 7) || t('no geohash')}</small></span>
            <span>{t(scalarText(post.placement_state ?? 'unknown').replaceAll('_', ' '))}</span>
            <span>{new Date(iso(post.created_at)).toLocaleDateString(locale)}</span>
          </div>
        ))}
        {!postError ? <PageNavigation path="/admin/places" parameters={parameters} prefix="posts" next={postPage.next} previous={postPage.previous} /> : <p className="emptyState"><a href="/admin/places">{t('Return to the first page.')}</a></p>}
      </section>
      <section className="panel actionPanel">
        <div className="panelHeader"><h2>{t('Campaign locations')}</h2></div>
        <div className="dataRow place header"><span>{t('Campaign / label')}</span><span>{t('Coordinate')}</span><span>{t('Status')}</span><span>{t('Created')}</span></div>
        {locationError ? <p className="emptyState">{t('Campaign locations could not be loaded.')}</p> : locations.length === 0 ? <p className="emptyState">{t('No campaign locations.')}</p> : locations.map(location => (
          <div className="dataRow place" key={location.id}>
            <span><b>{scalarText(location.campaign_name ?? t('Unassigned campaign'))}</b><small>{scalarText(location.label ?? location.id)}</small></span>
            <span>{formatLatLng(location.latitude, location.longitude)}</span>
            <span>{t(scalarText(location.status ?? 'unknown'))}</span>
            <span>{new Date(iso(location.created_at)).toLocaleDateString(locale)}</span>
          </div>
        ))}
        {!locationError ? <PageNavigation path="/admin/places" parameters={parameters} prefix="locations" next={locationPage.next} previous={locationPage.previous} /> : <p className="emptyState"><a href="/admin/places">{t('Return to the first page.')}</a></p>}
      </section>
    </section>
  );
}
