import { klipyAppKey, strokePolylines, summarizePostContent } from '../../../../lib/postContent';
import KlipyGifPreview from './KlipyGifPreview';
import { getI18n } from '../../../../lib/i18n-server';
import { withStableKeys } from '../../../../lib/values';

/** Read-only view of what a post actually contains, so drawings can be reviewed before approval. */
export default async function PostContentPreview({ post }: Readonly<{ post: Record<string, unknown> }>) {
  const { texts, klipyGifs, strokes, source } = summarizePostContent(post);
  // Optional: without a key the moderator still sees the slug.
  const klipyKey = klipyAppKey(process.env.KLIPY_APP_KEY);
  const { t } = await getI18n();
  if (texts.length === 0 && klipyGifs.length === 0 && strokes.length === 0 && !source?.url) return <p className="muted">{t('No stored content.')}</p>;
  const lines = withStableKeys(strokePolylines(strokes), line => JSON.stringify([line.color, line.points]));
  return (
    <details>
      <summary>
        {t('Content')}{klipyGifs.length > 0 ? ' · GIF' : ''}{strokes.length > 0 ? ` · ${t('drawing')} (${strokes.length})` : ''}{source?.url ? ` · ${t('legacy link')}` : ''}
      </summary>
      {lines.length > 0 ? (
        <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label={t('Drawing preview')} style={{ background: '#111820', borderRadius: 8, display: 'block', margin: '8px 0' }}>
          {lines.map(({ key, value: line }) => (
            <polyline key={key} points={line.points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      ) : null}
      {klipyGifs.map(slug => (klipyKey
        ? <KlipyGifPreview key={slug} slug={slug} appKey={klipyKey} failedLabel={t('GIF could not be loaded')} />
        : <small key={slug}>KLIPY GIF · {slug}</small>))}
      {withStableKeys(texts, text => text).map(({ key, value: text }) => <small key={key}>“{text}”</small>)}
      {source?.url ? (
        <small>
          {t('Legacy link, no longer shown in the app')}: {source.platform}{source.title ? ` · ${source.title}` : ''}{source.author ? ` · ${source.author}` : ''}
          {source.url ? <> · <a href={source.url} target="_blank" rel="noopener noreferrer">{new URL(source.url).hostname}</a></> : null}
        </small>
      ) : null}
    </details>
  );
}
