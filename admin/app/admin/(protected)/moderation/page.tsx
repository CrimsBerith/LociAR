import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import FlagActions from './FlagActions';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function ModerationPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'posts.read' });
  const db = adminDb();
  let flags: Array<Record<string, unknown> & { id: string }> = [];
  let posts = new Map<string, Record<string, unknown>>();
  let originals = new Map<string, Record<string, unknown>>();
  let comments = new Map<string, Record<string, unknown>>();
  let failed = false;
  try {
    page = await readDocumentPage(db.collection('moderation_flags').where('status', '==', 'open'), { direction: 'asc', scope: 'moderation-open', cursors: pageCursors(params) });
    flags = page.documents.map(d => ({ ...d.data(), id: d.id }));
    const postIds = [...new Set(flags.map(f => f.post_id).filter((id): id is string => typeof id === 'string'))];
    const postDocs = postIds.length ? await db.getAll(...postIds.map(id => db.collection('posts').doc(id))) : [];
    const originalDocs = flags.length ? await db.getAll(...flags.map(f => db.collection('moderation_originals').doc(f.id))) : [];
    originals = new Map(originalDocs.filter(d => d.exists).map(d => [d.id, d.data()!]));
    const commentIds = flags.map(f => (f.metadata as Record<string, unknown> | undefined)?.comment_id).filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
    const commentDocs = commentIds.length ? await db.getAll(...commentIds.map(id => db.collection('comments').doc(id))) : [];
    comments = new Map(commentDocs.filter(d => d.exists).map(d => [d.id, d.data()!]));
    posts = new Map(postDocs.filter(d => d.exists).map(d => [d.id, d.data()!]));
  } catch {
    failed = true;
  }

  return (
    <section className="page">
      <div className="pageHeading">
        <div><p className="eyebrow">Trust & safety</p><h1>Moderation queue</h1></div>
        <p className="muted">Every decision requires MFA, scoped permission, a reason, idempotency, rate limiting and an audit record.</p>
      </div>
      <section className="panel">
        <div className="dataRow moderation header"><span>Report</span><span>Post</span><span>Reporter</span><span>Decision</span></div>
        {failed ? <p className="emptyState">Moderation data could not be loaded.</p> : flags.length === 0 ? <p className="emptyState">No open reports.</p> : flags.map(flag => {
          const post = typeof flag.post_id === 'string' ? posts.get(flag.post_id) : undefined;
          const original = originals.get(flag.id);
          const metadata = flag.metadata as Record<string, unknown> | undefined;
          const comment = typeof metadata?.comment_id === 'string' ? comments.get(metadata.comment_id) : undefined;
          const content = original ?? comment;
          return (
            <div className="dataRow moderation" key={flag.id}>
              <span><b>{String(flag.reason)}</b><small>{flag.id} · {new Date(iso(flag.created_at)).toLocaleString('en-US')}</small></span>
              <span>{content ? String(content.text ?? '') : post ? String(post.caption || 'Untitled post') : 'Content unavailable'}<small>{content ? `Author: ${String(content.user_id ?? '')}${content.field ? ` · Field: ${String(content.field)}` : ''}` : ''}</small><small>{post ? `${String(post.status)}${post.deleted_at ? ' · trash' : ''}` : String(flag.post_id ?? 'No post')}</small></span>
              <span>{String(flag.user_id ?? 'Server filter')}</span>
              <span><FlagActions flagId={flag.id} hasPost={Boolean(post || content)} /></span>
            </div>
          );
        })}
        {!failed ? <PageNavigation path="/admin/moderation" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/moderation">Return to the first page.</a></p>}
      </section>
    </section>
  );
}
