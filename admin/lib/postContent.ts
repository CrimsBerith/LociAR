/** Moderator-facing summary of a stored post: text layers, drawing strokes and the linked source. */

export type DrawingStroke = { color: string; points: Array<{ x: number; y: number }> };
export type PostContentSummary = {
  texts: string[];
  strokes: DrawingStroke[];
  source: { platform: string; url: string | null; title: string | null; author: string | null } | null;
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXTS = 20;
const MAX_STROKES = 20;
const MAX_POINTS = 2000;

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value ? value.slice(0, max) : null;
}

export function summarizePostContent(post: Record<string, unknown>): PostContentSummary {
  const texts: string[] = [];
  const strokes: DrawingStroke[] = [];
  const edit = parseJson(post.edit_data_json) as { layers?: unknown } | null;
  const layers = Array.isArray(edit?.layers) ? edit.layers : [];
  for (const raw of layers) {
    const layer = (raw ?? {}) as Record<string, unknown>;
    const type = String(layer.type ?? layer.kind ?? '');
    if (type === 'drawing' && Array.isArray(layer.points) && strokes.length < MAX_STROKES) {
      const points = layer.points.slice(0, MAX_POINTS).flatMap((p: unknown) => {
        const { x, y } = (p ?? {}) as { x?: unknown; y?: unknown };
        return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
      });
      if (points.length > 0) strokes.push({ color: typeof layer.color === 'string' && COLOR.test(layer.color) ? layer.color : '#ffffff', points });
    } else if (typeof layer.text === 'string' && layer.text && texts.length < MAX_TEXTS) {
      texts.push(layer.text.slice(0, 1000));
    }
  }
  const rawSource = parseJson(post.content_source_json) as Record<string, unknown> | null;
  const preview = (rawSource?.preview ?? {}) as Record<string, unknown>;
  const source = rawSource && typeof rawSource === 'object'
    ? {
        platform: str(rawSource.platform, 32) ?? 'other',
        url: safeHttpsUrl(rawSource.url),
        title: str(preview.title, 200) ?? str(rawSource.title, 200),
        author: str(preview.author, 120),
      }
    : null;
  return { texts, strokes, source };
}

/** Maps all strokes into a `size`×`size` box, keeping aspect ratio. Returns SVG polyline `points` strings. */
export function strokePolylines(strokes: DrawingStroke[], size = 160, pad = 8): Array<{ color: string; points: string }> {
  const all = strokes.flatMap(s => s.points);
  if (all.length === 0) return [];
  const xs = all.map(p => p.x);
  const ys = all.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-6);
  const scale = (size - pad * 2) / span;
  const fmt = (n: number) => Math.round(n * 10) / 10;
  return strokes.map(s => ({
    color: s.color,
    points: s.points.map(p => `${fmt(pad + (p.x - minX) * scale)},${fmt(pad + (p.y - minY) * scale)}`).join(' '),
  }));
}
