import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, logger, requireCaller, safeErrorCode, Timestamp } from './core';
import { reasonError } from './errors';
import { anyBlocked } from './moderation';
import { GIF_ID } from './giphyId';
export { GIF_ID };
import { requireActiveAccount } from './profileGuard';

/**
 * GIF posts use GIPHY (Tenor's public API was shut down on 30 Jun 2026). The API key stays in
 * Secret Manager: the app searches through `searchGifs` and posts carry only a GIPHY id, never a
 * URL. createPost re-reads every id from GIPHY, so a client cannot attach an unrated or unknown GIF
 * or invent its size. The app builds media URLs from the id on GIPHY's media host only.
 */
export const GIPHY_API_KEY = defineSecret('GIPHY_API_KEY');

/** Highest GIPHY rating LociAR accepts; search requests it and createPost re-checks it. */
export const GIPHY_RATING = 'pg-13';
const ACCEPTED_RATINGS = new Set(['g', 'pg', 'pg-13']);
export const SEARCHES_PER_HOUR = 120;
const PAGE_SIZE = 24;
const MAX_OFFSET = 480;
const MAX_QUERY = 50;
const REQUEST_TIMEOUT_MS = 5_000;
/** GIPHY language codes for the app's 12 languages (GIPHY uses zh-CN for Simplified Chinese). */
const LANGS: Record<string, string> = {
  tr: 'tr', en: 'en', 'zh-hans': 'zh-CN', hi: 'hi', es: 'es', fr: 'fr', ar: 'ar', bn: 'bn', pt: 'pt', ru: 'ru', de: 'de', ja: 'ja',
};

export type GifSummary = { id: string; title: string; width: number; height: number };
type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The GIPHY host; the emulator suite may point it at a local stub. */
export function giphyBaseURL(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FUNCTIONS_EMULATOR === 'true' && env.GIPHY_API_BASE_URL) return env.GIPHY_API_BASE_URL.replace(/\/$/, '');
  return 'https://api.giphy.com';
}

export function giphyLanguage(locale: unknown): string {
  const value = typeof locale === 'string' ? locale.toLowerCase() : '';
  return LANGS[value] ?? LANGS[value.split(/[-_]/)[0]] ?? 'en';
}

/** Keeps only an id, a title and the original size; drops GIPHY's URLs, user and analytics fields. */
export function summarizeGif(raw: unknown): GifSummary | null {
  const gif = (raw ?? {}) as { id?: unknown; title?: unknown; rating?: unknown; images?: { original?: { width?: unknown; height?: unknown } } };
  const id = typeof gif.id === 'string' ? gif.id : '';
  if (!GIF_ID.test(id) || !ACCEPTED_RATINGS.has(String(gif.rating ?? '').toLowerCase())) return null;
  const width = Number(gif.images?.original?.width);
  const height = Number(gif.images?.original?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) return null;
  const title = typeof gif.title === 'string' ? gif.title.trim().slice(0, 140) : '';
  return { id, title: anyBlocked([title]) ? '' : title, width, height };
}

/** Builds a GIPHY search (or trending, for an empty query) request URL. */
export function searchURL(apiKey: string, query: string, offset: number, lang: string, base = giphyBaseURL()): string {
  const params = new URLSearchParams({ api_key: apiKey, limit: String(PAGE_SIZE), offset: String(offset), rating: GIPHY_RATING, bundle: 'messaging_non_clips' });
  if (!query) return `${base}/v1/gifs/trending?${params}`;
  params.set('q', query);
  params.set('lang', lang);
  return `${base}/v1/gifs/search?${params}`;
}

async function giphyJSON(url: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`giphy_http_${response.status}`);
  return response.json();
}

/** Reads one GIF from GIPHY. Returns null when it does not exist or is rated above GIPHY_RATING. */
export async function fetchGif(id: string, apiKey: string, fetcher: Fetcher = fetch, base = giphyBaseURL()): Promise<GifSummary | null> {
  if (!GIF_ID.test(id)) return null;
  const body = await giphyJSON(`${base}/v1/gifs/${encodeURIComponent(id)}?${new URLSearchParams({ api_key: apiKey })}`, fetcher);
  return body ? summarizeGif((body as { data?: unknown }).data) : null;
}

function apiKey(): string {
  const key = GIPHY_API_KEY.value();
  if (!key) {
    logger.error('giphy_key_missing');
    throw reasonError('unavailable', 'GIF search is unavailable', 'gif_unavailable');
  }
  return key;
}

/**
 * Replaces each `gif` layer with the size GIPHY reports for its id. Throws invalid-argument for an
 * unknown or over-rated GIF and unavailable when GIPHY cannot be reached (createPost never falls
 * back to the client's values).
 */
export async function resolveGifLayers(editData: { layers?: unknown[] }, fetcher: Fetcher = fetch): Promise<void> {
  const layers = editData.layers ?? [];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = (layers[index] ?? {}) as Record<string, unknown>;
    if (String(layer.type ?? layer.kind) !== 'gif') continue;
    let gif: GifSummary | null;
    try {
      gif = await fetchGif(String(layer.gifId ?? ''), apiKey(), fetcher);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.warn('giphy_lookup_failed', { code: safeErrorCode(error) });
      throw reasonError('unavailable', 'GIF service is unavailable', 'gif_unavailable');
    }
    if (!gif) throw reasonError('invalid-argument', 'GIF not available', 'gif_invalid');
    layers[index] = {
      id: layer.id, type: 'gif', gifId: gif.id, width: gif.width, height: gif.height,
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, zIndex: 0,
    };
  }
}

/** GIF search for the post editor. An empty query returns trending GIFs. */
export const searchGifs = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, secrets: [GIPHY_API_KEY] }, async (request) => {
  const caller = requireCaller(request);
  const data = (request.data ?? {}) as { query?: unknown; offset?: unknown; locale?: unknown };
  const query = typeof data.query === 'string' ? data.query.trim().slice(0, MAX_QUERY) : '';
  const offset = Number.isInteger(data.offset) ? Math.min(Math.max(Number(data.offset), 0), MAX_OFFSET) : 0;
  if (anyBlocked([query])) return { gifs: [], nextOffset: null };

  const now = Date.now();
  const quotaRef = db.collection('gif_search_quota').doc(`${caller.luid}_${Math.floor(now / 3_600_000)}`);
  const allowed = await db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, caller.luid);
    const count = Number((await tx.get(quotaRef)).data()?.count ?? 0);
    if (count >= SEARCHES_PER_HOUR) return false;
    tx.set(quotaRef, { owner_luid: caller.luid, count: FieldValue.increment(1), expires_at: Timestamp.fromMillis(now + 2 * 3_600_000) }, { merge: true });
    return true;
  });
  if (!allowed) throw reasonError('resource-exhausted', 'GIF search limit reached', 'rate_limited');

  let body: unknown;
  try {
    body = await giphyJSON(searchURL(apiKey(), query, offset, giphyLanguage(data.locale)), fetch);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn('giphy_search_failed', { code: safeErrorCode(error) });
    throw reasonError('unavailable', 'GIF service is unavailable', 'gif_unavailable');
  }
  const raw = Array.isArray((body as { data?: unknown } | null)?.data) ? (body as { data: unknown[] }).data : [];
  const gifs = raw.map(summarizeGif).filter((gif): gif is GifSummary => gif !== null);
  const nextOffset = raw.length === PAGE_SIZE && offset + PAGE_SIZE <= MAX_OFFSET ? offset + PAGE_SIZE : null;
  return { gifs, nextOffset };
});
