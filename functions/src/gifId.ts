import { reasonError } from './errors';

/**
 * A KLIPY GIF slug as KLIPY returns it (`happy-cat-f7u`, or `happy-cat-f7u--kOKp0sbu4` from a
 * search). Letters, digits, `-` and `_` only: no dot, slash, colon or space, so it can never carry
 * a URL or a path either.
 */
export const KLIPY_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const MAX_GIF_SIDE = 4096;
/** Widest and tallest shape a GIF bubble may take; the app clamps the drawn shape as well. */
const MAX_GIF_ASPECT = 5;

export type KlipyGifLayer = { gifSlug: string; width: number; height: number };

/**
 * Reads the KLIPY fields of a `gif` layer. KLIPY requires its API to be called from the user's
 * device, so the server cannot look the GIF up: it stores the slug only (never a URL) and treats
 * the size as a layout hint, bounded here. The app loads the media from KLIPY by slug.
 */
export function klipyGifLayer(layer: Record<string, unknown>): KlipyGifLayer | null {
  if (layer.provider !== 'klipy') return null;
  const { gifSlug, width, height } = layer;
  if (typeof gifSlug !== 'string' || !KLIPY_SLUG.test(gifSlug)) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  const w = width as number;
  const h = height as number;
  if (w < 1 || h < 1 || w > MAX_GIF_SIDE || h > MAX_GIF_SIDE) return null;
  if (w > h * MAX_GIF_ASPECT || h > w * MAX_GIF_ASPECT) return null;
  return { gifSlug, width: w, height: h };
}

/** True only for one KLIPY GIF. A `gifId` is refused. */
export function isValidGifLayer(layer: Record<string, unknown>): boolean {
  if (layer.gifId != null) return false;
  return klipyGifLayer(layer) !== null;
}

/** Keeps a validated KLIPY slug and size. Other GIF identifiers are refused. */
export function resolveGifLayers(editData: { layers?: unknown[] }): void {
  const layers = editData.layers ?? [];
  for (const [index, raw] of layers.entries()) {
    const layer = (raw ?? {}) as Record<string, unknown>;
    const type = layer.type ?? layer.kind;
    if (type !== 'gif') continue;
    const klipy = klipyGifLayer(layer);
    if (!klipy) throw reasonError('invalid-argument', 'GIF not available', 'gif_invalid');
    layers[index] = {
      id: layer.id, type: 'gif', provider: 'klipy', gifSlug: klipy.gifSlug, width: klipy.width, height: klipy.height,
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, zIndex: 0,
    };
  }
}
