import { distanceMeters } from './geo';
import { SPOT_JOIN_RADIUS_M, SPOT_MEMBERSHIP_VERSION, spotOf, stableUuid, validCoordinates, type Spot } from './placeNoteRules';

export type MapGroupPost = { id: string; lat: number; lng: number; spotId?: string };
export type MapNoteGroup = {
  id: string; lat: number; lng: number; count: number; radius: number; post_ids: string[];
};

/** One geometry for map summaries and access checks, including places crossing ±180°. */
export function mapGroupSummary(id: string, posts: MapGroupPost[]): MapNoteGroup {
  return { id, ...spotOf(posts), post_ids: posts.map(post => post.id) };
}

/** Stable identities come from server spots; small, not-yet-clustered sets use a fixed 6 m anchor. */
export function mapNoteGroups(posts: MapGroupPost[]): MapNoteGroup[] {
  const groups: Array<{ id: string; spotId?: string; anchorLat: number; anchorLng: number; posts: MapGroupPost[] }> = [];
  for (const post of [...posts].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    if (!validCoordinates(post.lat, post.lng)) continue;
    const id = post.spotId ? `spot:${post.spotId}` : `post:${post.id}`;
    let group = groups.find(g => g.spotId === post.spotId
      && distanceMeters(post.lat, post.lng, g.anchorLat, g.anchorLng) <= SPOT_JOIN_RADIUS_M);
    if (!group) {
      // A legacy spot can contain several places. Extra groups use their own visible anchor,
      // preserving the existing spot:/post: wire format without trusting client member hints.
      group = { id: post.spotId && groups.some(g => g.spotId === post.spotId) ? `post:${post.id}` : id,
        spotId: post.spotId, anchorLat: post.lat, anchorLng: post.lng, posts: [] };
      groups.push(group);
    }
    group.posts.push(post);
  }
  return groups.map(group => mapGroupSummary(group.id, group.posts))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id, 'en'));
}

/** Offline migration plan. Keep every existing in-radius member in its original fixed spot. */
export function splitSpotPlan(spotId: string, centre: Spot, posts: MapGroupPost[]): MapNoteGroup[] {
  if (!validCoordinates(centre.lat, centre.lng) || posts.some(p => !validCoordinates(p.lat, p.lng))) {
    throw new RangeError('Repair invalid coordinates before splitting spots');
  }
  const inside = posts.filter(p => distanceMeters(centre.lat, centre.lng, p.lat, p.lng) <= SPOT_JOIN_RADIUS_M);
  const retained = new Set(inside.map(p => p.id));
  const groups = mapNoteGroups(posts.filter(p => !retained.has(p.id)).map(p => ({ ...p, spotId: undefined })))
    .map(g => ({ ...g, id: stableUuid(`spot-split-v${SPOT_MEMBERSHIP_VERSION}:${SPOT_JOIN_RADIUS_M}:${spotId}:${g.id}`) }));
  if (inside.length) groups.unshift({ id: spotId, lat: centre.lat, lng: centre.lng, count: inside.length,
    radius: Math.max(...inside.map(p => distanceMeters(centre.lat, centre.lng, p.lat, p.lng))),
    post_ids: inside.map(p => p.id).sort((a, b) => a.localeCompare(b, 'en')) });
  return groups;
}
