import { isAllowedSocialLink } from './placement';

/**
 * Best-effort preview (title, author, thumbnail) for a social link, fetched by the server at
 * createPost time so clients never contact third parties for it and cannot forge it.
 * Only platforms with a keyless public oEmbed endpoint are supported; Instagram and Facebook
 * need a Meta app token and are skipped.
 */
export type LinkPreview = { title?: string; author?: string; thumbnailUrl?: string };

type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  ok: boolean;
  text(): Promise<string>;
}>;

const OEMBED_ENDPOINTS: Record<string, string> = {
  youtube: 'https://www.youtube.com/oembed',
  spotify: 'https://open.spotify.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
};

/** Thumbnail hosts (exact or as a suffix) we are willing to store. Anything else is dropped. */
const THUMBNAIL_HOSTS: Record<string, string[]> = {
  youtube: ['i.ytimg.com', 'img.youtube.com'],
  spotify: ['i.scdn.co', 'mosaic.scdn.co'],
  tiktok: ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'],
};

const FETCH_TIMEOUT_MS = 3000;
const MAX_BODY_CHARS = 64 * 1024;
const MAX_TITLE = 140;
const MAX_AUTHOR = 80;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return Array.from(text).slice(0, max).join('');
}

function allowedThumbnail(platform: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return undefined;
  const host = parsed.hostname.toLowerCase();
  const ok = (THUMBNAIL_HOSTS[platform] ?? []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  return ok ? parsed.toString() : undefined;
}

export async function fetchLinkPreview(
  platform: string,
  url: unknown,
  fetcher: Fetcher = (u, init) => fetch(u, init),
): Promise<LinkPreview | null> {
  const endpoint = OEMBED_ENDPOINTS[platform];
  if (!endpoint || !isAllowedSocialLink(platform, url)) return null;
  try {
    const target = `${endpoint}?${new URLSearchParams({ url: url as string, format: 'json' }).toString()}`;
    const response = await fetcher(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json', 'user-agent': 'LociAR-link-preview/1.0' },
    });
    if (!response.ok) return null;
    const raw = await response.text();
    if (raw.length > MAX_BODY_CHARS) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const preview: LinkPreview = {};
    const title = cleanText(data.title, MAX_TITLE);
    const author = cleanText(data.author_name, MAX_AUTHOR);
    const thumbnailUrl = allowedThumbnail(platform, data.thumbnail_url);
    if (title) preview.title = title;
    if (author) preview.author = author;
    if (thumbnailUrl) preview.thumbnailUrl = thumbnailUrl;
    return Object.keys(preview).length > 0 ? preview : null;
  } catch {
    return null;
  }
}

/**
 * Keeps only the fields clients may send (platform, url, mediaKind, title) and attaches the
 * server-fetched preview, so `content_source_json` cannot carry arbitrary client data.
 */
export function storedContentSource(
  source: Record<string, unknown> | null | undefined,
  preview: LinkPreview | null,
): Record<string, unknown> | null {
  if (!source) return null;
  const stored: Record<string, unknown> = {};
  for (const key of ['platform', 'url', 'mediaKind', 'title'] as const) {
    if (typeof source[key] === 'string') stored[key] = source[key];
  }
  if (preview) stored.preview = preview;
  return stored;
}
