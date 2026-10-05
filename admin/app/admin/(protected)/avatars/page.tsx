import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import AdminDecision from '../AdminDecision';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function AvatarsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'users.suspend' });
  const db = adminDb();
  let reviews: Array<Record<string, unknown> & { id: string; imageUrl: string | null; handle: string }> = [];
  let failed = false;
  try {
    page = await readDocumentPage(db.collection('avatar_reviews').where('status', '==', 'pending'), { scope: 'avatars-pending', size: 60, cursors: pageCursors(params) });
    const profiles = !page.documents.length ? [] : await db.getAll(...page.documents.map(d => db.collection('profiles').doc(d.id)));
    const handles = new Map(profiles.map(p => [p.id, String(p.data()?.handle ?? 'unknown')]));
    reviews = page.documents.map(d => ({ ...d.data(), id: d.id,
      imageUrl: `/api/admin/v1/avatars/${d.id}/image`, handle: handles.get(d.id) ?? 'unknown' }));
  } catch {
    failed = true;
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Trust & safety</p><h1>Profile photos</h1></div>
        <p className="muted">Photos already passed automatic SafeSearch screening. Remove anything that breaks the community rules.</p>
      </div>
      <section className="panel">
        <div className="dataRow moderation header"><span>Photo</span><span>User</span><span>SafeSearch</span><span>Decision</span></div>
        {failed ? <p className="emptyState">Photo reviews could not be loaded.</p> : reviews.length === 0 ? <p className="emptyState">No photos waiting for review.</p> : reviews.map(review => (
          <div className="dataRow moderation" key={review.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated moderation image relay */}
            <span>{review.imageUrl ? <img src={review.imageUrl} alt={`Profile photo of @${review.handle}`} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 12 }} /> : 'Unavailable'}</span>
            <span><b>@{review.handle}</b><small>{review.id} · {new Date(iso(review.created_at)).toLocaleString('en-US')}</small></span>
            <span><small>{Object.entries((review.safe_search ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</small></span>
            <span>
              <AdminDecision
                endpoint={`/api/admin/v1/avatars/${review.id}/decision`}
                actions={[
                  { label: 'Keep', body: { action: 'approve' }, className: 'secondaryButton' },
                  { label: 'Remove', body: { action: 'remove' }, className: 'dangerButton' },
                ]}
              />
            </span>
          </div>
        ))}
        {!failed ? <PageNavigation path="/admin/avatars" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/avatars">Return to the first page.</a></p>}
      </section>
    </main>
  );
}
