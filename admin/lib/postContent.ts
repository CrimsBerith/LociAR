/** Moderator-facing summary of a stored post: text layers, the GIF (KLIPY, or GIPHY on older posts), legacy drawing strokes and legacy links. */

export type DrawingStroke = { color: string; points: Array<{ x: number; y: number }> };
export type PostContentSummary = {
  texts: string[];
  /** GIPHY ids (letters and digits only, as createPost stored them before the KLIPY switch). */
  gifs: string[];
  /** KLIPY slugs (letters, digits, `-`, `_`), as createPost stores them now. */
  klipyGifs: string[];
  strokes: DrawingStroke[];
  source: { platform: string; url: string | null; title: string | null; author: string | null } | null;
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
const GIF_ID = /^[A-Za-z0-9]{1,64}$/;
const KLIPY_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KLIPY_KEY = /^[A-Za-z0-9]{16,128}$/;
const KLIPY_MEDIA_HOST = /^static\d*\.klipy\.com$/;
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
  const gifs: string[] = [];
  const klipyGifs: string[] = [];
  const strokes: DrawingStroke[] = [];
  const edit = parseJson(post.edit_data_json) as { layers?: unknown } | null;
  const layers = Array.isArray(edit?.layers) ? edit.layers : [];
  for (const raw of layers) {
    const layer = (raw ?? {}) as Record<string, unknown>;
    const type = String(layer.type ?? layer.kind ?? '');
    if (type === 'gif') {
      if (gifs.length + klipyGifs.length >= 1) continue;
      if (layer.provider === 'klipy') {
        if (typeof layer.gifSlug === 'string' && KLIPY_SLUG.test(layer.gifSlug)) klipyGifs.push(layer.gifSlug);
      } else if (typeof layer.gifId === 'string' && GIF_ID.test(layer.gifId)) gifs.push(layer.gifId);
    } else if (type === 'drawing' && Array.isArray(layer.points) && strokes.length < MAX_STROKES) {
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
  return { texts, gifs, klipyGifs, strokes, source };
}

/** A usable KLIPY app key for the moderator preview, or null when none is configured. */
export function klipyAppKey(value: unknown): string | null {
  return typeof value === 'string' && KLIPY_KEY.test(value.trim()) ? value.trim() : null;
}

/** KLIPY's lookup URL for one slug. KLIPY media URLs cannot be built from a slug. */
export function klipyItemsUrl(appKey: string, slug: string): string | null {
  if (!KLIPY_KEY.test(appKey) || !KLIPY_SLUG.test(slug)) return null;
  return `https://api.klipy.com/api/v1/${appKey}/gifs/items?slugs=${encodeURIComponent(slug)}`;
}

/** The small animated rendition in a KLIPY items response, only if it is on a KLIPY media host. */
export function klipyPreviewFromItems(body: unknown): string | null {
  const item = ((body as { data?: { data?: unknown } } | null)?.data?.data as unknown[] | undefined)?.[0];
  const file = (item as { file?: Record<string, { gif?: { url?: unknown } } | undefined> } | undefined)?.file;
  for (const size of ['sm', 'md', 'xs', 'hd']) {
    const raw = file?.[size]?.gif?.url;
    if (typeof raw !== 'string') continue;
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && !url.username && !url.port && KLIPY_MEDIA_HOST.test(url.hostname)) return url.toString();
    } catch { /* not a URL */ }
  }
  return null;
}

/** The small animated rendition of a GIPHY GIF, built from a validated id only. */
export function giphyPreviewUrl(id: string): string | null {
  return GIF_ID.test(id) ? `https://media.giphy.com/media/${id}/200w.gif` : null;
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
