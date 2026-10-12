/** Anonymous Auth is an installation identity, never a verified email identity. */
export function mayPublishAnonymously(caller: { provider: string; isAnonymous: boolean; isAppleUser: boolean; emailVerified: boolean }): boolean {
  return caller.isAnonymous || caller.isAppleUser || caller.emailVerified;
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
