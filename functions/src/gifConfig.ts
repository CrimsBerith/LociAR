import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { CALLABLE_MAX_INSTANCES, ENFORCE_APP_CHECK, logger, requireCaller } from './core';
import { reasonError } from './errors';

/**
 * GIFs come from KLIPY. KLIPY's integration rules require searches and media to be requested by
 * the user's device, not by a partner server, so the app calls KLIPY itself. The app key is not
 * in the repository or the app binary: a signed-in, App Check-verified app reads it here, which
 * also lets the key be rotated without an app update.
 */
export const KLIPY_APP_KEY = defineSecret('KLIPY_APP_KEY');

/** KLIPY content safety level requested with every search (`off`, `low`, `medium`, `high`).
 * `low` permits low, medium, and high safe content (G, PG, PG-13), matching the app's PG-13 policy. */
export const KLIPY_CONTENT_FILTER = 'low';
export const KLIPY_PAGE_SIZE = 24;

export type GifConfig = { provider: 'klipy'; appKey: string; contentFilter: string; perPage: number };

export function gifConfig(appKey: string | undefined): GifConfig {
  const key = (appKey ?? '').trim();
  // KLIPY keys are letters and digits; anything else would break the request path.
  if (!/^[A-Za-z0-9]{16,128}$/.test(key)) {
    logger.error('klipy_key_missing');
    throw reasonError('unavailable', 'GIF search is unavailable', 'gif_unavailable');
  }
  return { provider: 'klipy', appKey: key, contentFilter: KLIPY_CONTENT_FILTER, perPage: KLIPY_PAGE_SIZE };
}

/** Client configuration for GIF search. Never logged. */
export const getGifConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, secrets: [KLIPY_APP_KEY] }, (request) => {
  requireCaller(request);
  return gifConfig(KLIPY_APP_KEY.value());
});
