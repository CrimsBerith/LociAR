import { requireAdmin } from '../../../../lib/admin';
import { adminBucket, adminDb, iso } from '../../../../lib/firebase-admin';
import AdminDecision from '../AdminDecision';

export const dynamic = 'force-dynamic';

export default async function AvatarsPage() {
  await requireAdmin({ permission: 'users.suspend' });
  const db = adminDb();
  let reviews: Array<Record<string, unknown> & { id: string; imageUrl: string | null; handle: string }> = [];
  let failed = false;
  try {
    const snap = await db.collection('avatar_reviews').where('status', '==', 'pending').orderBy('created_at', 'desc').limit(60).get();
    const profiles = snap.empty ? [] : await db.getAll(...snap.docs.map(d => db.collection('profiles').doc(d.id)));
    const handles = new Map(profiles.map(p => [p.id, String(p.data()?.handle ?? 'unknown')]));
    reviews = await Promise.all(snap.docs.map(async d => {
      const path = String(d.data().path ?? '');
      let imageUrl: string | null = null;
      try {
        [imageUrl] = await adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
      } catch {
        imageUrl = null;
      }
      return { id: d.id, ...d.data(), imageUrl, handle: handles.get(d.id) ?? 'unknown' };
    }));
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
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
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
      </section>
    </main>
  );
}
