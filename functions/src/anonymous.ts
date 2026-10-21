/**
 * Posts are shown without their author, but every post belongs to a verified Apple or email
 * identity that moderators can act on (App Store 1.2; owner decision 17 Oct 2026). Guests
 * (Anonymous Auth installations) may browse, like, report and block, but not publish.
 */
export function mayPublishAnonymously(caller: { provider: string; isAnonymous: boolean; isAppleUser: boolean; emailVerified: boolean }): boolean {
  return !caller.isAnonymous && (caller.isAppleUser || caller.emailVerified);
}

/** A map locator must not disclose the author's account folder. The callable resolves it. */
export function anonymousGeometry(value: unknown, postId: string): unknown {
  if (Array.isArray(value)) return value.map(item => anonymousGeometry(item, postId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['referenceImageURI', 'referenceImageUri', 'assetURL', 'assetUrl'].includes(key)) return [key, null];
    if (['storagePath', 'assetURI', 'assetUri'].includes(key) && typeof item === 'string') {
      return [key, item.startsWith('storage://post-world-maps/') ? `anonymous-world-map://${postId}` : null];
    }
    return [key, anonymousGeometry(item, postId)];
  }));
}

export function anonymousIdentity(postId: string, creatorId: string, viewerId: string, anonymous: boolean) {
  // Owners retain their own ID for queued drafts, deletion and local ownership checks.
  return { creator_id: anonymous && creatorId !== viewerId ? postId : creatorId,
    creator_handle: anonymous ? null : undefined, is_anonymous: anonymous };
}

/** Public content has no legacy media locators or arbitrary metadata containing owner folders. */
export function publicEditData(value: unknown): Record<string, unknown> {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const layers = Array.isArray(data.layers) ? data.layers : [];
  const keys = ['id', 'type', 'text', 'color', 'opacity', 'scale', 'rotation', 'points', 'gifId', 'width', 'height',
    'x', 'y', 'zIndex', 'strokeWidth', 'fontSize'];
  const safe = layers.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const layer = raw as Record<string, unknown>, type = layer.type ?? layer.kind;
    if (!['text', 'gif', 'drawing'].includes(String(type))) return [];
    const cleaned: Record<string, unknown> = { type };
    for (const key of keys) {
      const item = layer[key];
      if ((['id', 'text', 'color', 'gifId'].includes(key) && typeof item === 'string')
          || (typeof item === 'number' && Number.isFinite(item))) cleaned[key] = item;
    }
    if (Array.isArray(layer.points)) cleaned.points = layer.points.slice(0, 2000).flatMap(point => {
      if (!point || typeof point !== 'object') return [];
      const p = point as { x?: unknown; y?: unknown };
      return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y) ? [{ x: p.x, y: p.y }] : [];
    });
    return [cleaned];
  });
  const canvas = data.canvas as { width?: unknown; height?: unknown } | undefined;
  const size = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(4096, Math.max(1, v)) : fallback;
  return { version: typeof data.version === 'number' ? data.version : 1, layers: safe,
    canvas: { width: size(canvas?.width, 1080), height: size(canvas?.height, 1920) } };
}
