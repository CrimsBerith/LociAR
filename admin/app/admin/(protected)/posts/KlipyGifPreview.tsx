'use client';

import { useEffect, useState } from 'react';
import { klipyItemsUrl, klipyPreviewFromItems } from '../../../../lib/postContent';

/**
 * Shows a KLIPY GIF to a moderator. KLIPY requires its API and media to be requested by the
 * viewer's browser (never by our server) and its media URLs to be used as returned, so the
 * lookup happens here and only KLIPY's own media hosts are accepted.
 */
export default function KlipyGifPreview({ slug, appKey, failedLabel }: Readonly<{ slug: string; appKey: string; failedLabel: string }>) {
  const [state, setState] = useState<{ src: string | null; done: boolean }>({ src: null, done: false });

  useEffect(() => {
    const url = klipyItemsUrl(appKey, slug);
    if (!url) { setState({ src: null, done: true }); return; }
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then(response => (response.ok ? response.json() : null))
      .then(body => setState({ src: klipyPreviewFromItems(body), done: true }))
      .catch(() => { if (!controller.signal.aborted) setState({ src: null, done: true }); });
    return () => controller.abort();
  }, [appKey, slug]);

  if (state.src) {
    // eslint-disable-next-line @next/next/no-img-element -- KLIPY media, allowed by the admin CSP only.
    return <img src={state.src} alt={`KLIPY GIF ${slug}`} width={200} referrerPolicy="no-referrer" style={{ display: 'block', margin: '8px 0', borderRadius: 8 }} />;
  }
  return <small>KLIPY GIF · {slug}{state.done ? ` · ${failedLabel}` : ''}</small>;
}
