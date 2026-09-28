import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import FlagActions from './FlagActions';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  await requireAdmin({ permission: 'posts.read' });
  const db = adminDb();
  let flags: Array<Record<string, unknown> & { id: string }> = [];
  let posts = new Map<string, Record<string, unknown>>();
  let failed = false;
  try {
    const snap = await db.collection('moderation_flags').where('status', '==', 'open').orderBy('created_at', 'asc').limit(100).get();
    flags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const postIds = [...new Set(flags.map(f => f.post_id).filter((id): id is string => typeof id === 'string'))];
    const postDocs = postIds.length ? await db.getAll(...postIds.map(id => db.collection('posts').doc(id))) : [];
    posts = new Map(postDocs.filter(d => d.exists).map(d => [d.id, d.data()!]));
  } catch {
    failed = true;
  }

  return (
    <main className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Trust & safety</p><h1>Moderation queue</h1></div>
        <p className="muted">Every decision requires MFA, scoped permission, a reason, idempotency, rate limiting and an audit record.</p>
      </div>
      <section className="panel">
        <div className="dataRow moderation header"><span>Report</span><span>Post</span><span>Reporter</span><span>Decision</span></div>
        {failed ? <p className="emptyState">Moderation data could not be loaded.</p> : flags.length === 0 ? <p className="emptyState">No open reports.</p> : flags.map(flag => {
          const post = typeof flag.post_id === 'string' ? posts.get(flag.post_id) : undefined;
          return (
            <div className="dataRow moderation" key={flag.id}>
              <span><b>{String(flag.reason)}</b><small>{flag.id} · {new Date(iso(flag.created_at)).toLocaleString('en-US')}</small></span>
              <span>{post ? String(post.caption || 'Untitled post') : 'Post unavailable'}<small>{post ? `${String(post.status)}${post.deleted_at ? ' · trash' : ''}` : String(flag.post_id ?? 'No post')}</small></span>
              <span>{String(flag.user_id ?? 'Anonymous')}</span>
              <span><FlagActions flagId={flag.id} hasPost={Boolean(post)} /></span>
            </div>
          );
        })}
      </section>
    </main>
  );
}
