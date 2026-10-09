import { strokePolylines, summarizePostContent } from '../../../../lib/postContent';

/** Read-only view of what a post actually contains, so drawings can be reviewed before approval. */
export default function PostContentPreview({ post }: { post: Record<string, unknown> }) {
  const { texts, strokes, source } = summarizePostContent(post);
  if (texts.length === 0 && strokes.length === 0 && !source) return null;
  const lines = strokePolylines(strokes);
  return (
    <details>
      <summary>
        Content{strokes.length > 0 ? ` · drawing (${strokes.length})` : ''}{source ? ` · ${source.platform}` : ''}
      </summary>
      {lines.length > 0 ? (
        <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label="Drawing preview" style={{ background: '#111820', borderRadius: 8, display: 'block', margin: '8px 0' }}>
          {lines.map((line, i) => (
            <polyline key={i} points={line.points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      ) : null}
      {texts.map((text, i) => <small key={i}>“{text}”</small>)}
      {source ? (
        <small>
          {source.platform}{source.title ? ` · ${source.title}` : ''}{source.author ? ` · ${source.author}` : ''}
          {source.url ? <> · <a href={source.url} target="_blank" rel="noopener noreferrer">{new URL(source.url).hostname}</a></> : null}
        </small>
      ) : null}
    </details>
  );
}
