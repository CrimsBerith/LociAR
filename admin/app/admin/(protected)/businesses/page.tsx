import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import { readDocumentPage, pageCursors, type SearchParameters } from '../../../../lib/pagination';
import PageNavigation from '../PageNavigation';
import AdminDecision from '../AdminDecision';
import BusinessEditor from './BusinessEditor';
export const dynamic = 'force-dynamic';

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const admin = await requireAdmin({ permission: 'posts.read' }), params = await searchParams, db = adminDb();
  const page = await readDocumentPage(db.collection('business_places'), { scope: 'businesses', cursors: pageCursors(params), size: 25 });
  const notes = await Promise.all(page.documents.map(v => db.collection('posts').where('business_id', '==', v.id).orderBy('created_at', 'desc').limit(10).get()));
  return <section className="page"><h1>Businesses and attached notes</h1><p className="muted">Review the exact business, its entrance coordinates and the user who wrote each note. Author IDs are private to the authorized panel; public notes remain anonymous. Closing, pausing, moving or renaming a business invalidates older notes. Only reviewed notes tied to the current active revision can notify.</p>
    {page.documents.map((v, i) => <article className="panel" key={v.id}><h2>{String(v.get('name'))}</h2><p>{v.id} · {String(v.get('status'))} · Revision {v.get('revision')} · {v.get('lat')}, {v.get('lng')} · Diameter {v.get('notify_diameter_m') ?? 5} m</p>
      {admin.permissions.has('places.write') ? <BusinessEditor key={`${v.id}-${iso(v.get('updated_at'))}`} venue={{ id: v.id, name: v.get('name'), lat: v.get('lat'), lng: v.get('lng'), status: v.get('status'), diameter: v.get('notify_diameter_m') ?? 5 }} /> : null}
      <p><a href={`/admin/posts?business=${v.id}`}>All attached notes</a></p>
      {notes[i].docs.map(p => <article key={p.id}><p><a href={`/admin/posts/${p.id}`}>{String(p.get('caption'))}</a> · Author {String(p.get('creator_id'))} · {String(p.get('status'))} · Note revision {p.get('business_note.revision') ?? 'legacy'}</p>
        {admin.permissions.has('posts.moderate') ? <AdminDecision endpoint="/api/admin/v1/businesses" actions={[
          { label: 'Invalidate note', body: { action: 'invalidate', id: p.id } },
          { label: 'Revalidate → new review', body: { action: 'revalidate', id: p.id } },
        ]}/> : null}</article>)}
    </article>)}
    <PageNavigation path="/admin/businesses" next={page.next} previous={page.previous}/>
  </section>;
}
