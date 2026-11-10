import QueryResult from '../QueryResult';
import { scalarText } from '../../../../lib/values';
import { requireAdmin } from '../../../../lib/admin';
import { adminDb, iso } from '../../../../lib/firebase-admin';
import FlagActions from './FlagActions';
import { getI18n } from '../../../../lib/i18n-server';

import PageNavigation from '../PageNavigation';
import { pageCursors, readDocumentPage, type DocumentPage, type SearchParameters } from '../../../../lib/pagination';

export const dynamic = 'force-dynamic';

export default async function ModerationPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const params = await searchParams;
  let page: DocumentPage = { documents: [], next: null, previous: null };
  await requireAdmin({ permission: 'posts.read' });
  const { t, locale } = await getI18n();
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
        <div><p className="eyebrow">{t('Trust & safety')}</p><h1>{t('Moderation queue')}</h1></div>
        <p className="muted">{t('Every decision requires a verified administrator sign-in, scoped permission, a reason, idempotency, rate limiting and an audit record.')}</p>
      </div>
      <section className="panel">
        <div className="dataRow moderation header"><span>{t('Report')}</span><span>{t('Post')}</span><span>{t('Reporter')}</span><span>{t('Decision')}</span></div>
        <QueryResult failed={failed} isEmpty={flags.length === 0} failure={<p className="emptyState">{t('Moderation data could not be loaded.')}</p>} empty={<p className="emptyState">{t('No open reports.')}</p>}>{() => flags.map(flag => {
          const post = typeof flag.post_id === 'string' ? posts.get(flag.post_id) : undefined;
          const original = originals.get(flag.id);
          const metadata = flag.metadata as Record<string, unknown> | undefined;
          const comment = typeof metadata?.comment_id === 'string' ? comments.get(metadata.comment_id) : undefined;
          const content = original ?? comment;
          return (
            <div className="dataRow moderation" key={flag.id}>
              <span><b>{t(String(flag.reason))}</b><small>{flag.id} · {new Date(iso(flag.created_at)).toLocaleString(locale)}</small></span>
              <span>{contentCaption(content, post, t)}<small>{contentAuthor(content, t)}</small><small>{postState(post, flag, t)}</small></span>
              <span>{scalarText(flag.user_id ?? t('Server filter'))}</span>
              <span><FlagActions flagId={flag.id} hasPost={Boolean(post || content)} /></span>
            </div>
          );
        })}</QueryResult>
        {!failed ? <PageNavigation path="/admin/moderation" next={page.next} previous={page.previous} /> : <p className="emptyState"><a href="/admin/moderation">{t('Return to the first page.')}</a></p>}
      </section>
    </section>
  );
}

type TextRecord = Record<string, unknown>;
type Translate = Awaited<ReturnType<typeof getI18n>>['t'];
function contentCaption(content: TextRecord | undefined, post: TextRecord | undefined, t: Translate): string {
  if (content) return scalarText(content.text ?? '');
  return post ? scalarText(post.caption || t('Untitled post')) : t('Content unavailable');
}
function contentAuthor(content: TextRecord | undefined, t: Translate): string {
  if (!content) return '';
  const labels = [`${t('Author')}: ${scalarText(content.user_id ?? '')}`];
  if (content.field) labels.push(`${t('Field')}: ${scalarText(content.field)}`);
  return labels.join(' · ');
}
function postState(post: TextRecord | undefined, flag: TextRecord, t: Translate): string {
  if (!post) return scalarText(flag.post_id ?? t('No post'));
  const status = t(scalarText(post.status).replaceAll('_', ' '));
  return post.deleted_at ? status + ' · ' + t('trash') : status;
}
