import { distanceMeters, meanLongitude } from './geo';
import { MAX_SPOT_RADIUS_M, SPOT_JOIN_RADIUS_M, validCoordinates } from './placeNoteRules';

export type MapGroupPost = { id: string; lat: number; lng: number; spotId?: string };
export type MapNoteGroup = {
  id: string; lat: number; lng: number; count: number; radius: number; post_ids: string[];
};

/** One geometry for map summaries and access checks, including places crossing ±180°. */
export function mapGroupSummary(id: string, posts: MapGroupPost[]): MapNoteGroup {
  const lat = posts.reduce((sum, post) => sum + post.lat, 0) / posts.length;
  const lng = meanLongitude(posts.map(post => post.lng));
  return { id, lat, lng, count: posts.length, post_ids: posts.map(post => post.id),
    radius: Math.min(MAX_SPOT_RADIUS_M, Math.max(0, ...posts.map(post => distanceMeters(lat, lng, post.lat, post.lng)))) };
}

/** Stable identities come from server spots; small, not-yet-clustered sets use a fixed 25 m anchor. */
export function mapNoteGroups(posts: MapGroupPost[]): MapNoteGroup[] {
  const groups: Array<{ id: string; anchorLat: number; anchorLng: number; posts: MapGroupPost[] }> = [];
  for (const post of [...posts].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    if (!validCoordinates(post.lat, post.lng)) continue;
    const id = post.spotId ? `spot:${post.spotId}` : `post:${post.id}`;
    let group = post.spotId ? groups.find(g => g.id === id) : groups.find(g => g.id.startsWith('post:')
      && distanceMeters(post.lat, post.lng, g.anchorLat, g.anchorLng) <= SPOT_JOIN_RADIUS_M);
    if (!group) {
      group = { id, anchorLat: post.lat, anchorLng: post.lng, posts: [] };
      groups.push(group);
    }
    group.posts.push(post);
  }
  return groups.map(group => mapGroupSummary(group.id, group.posts))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id, 'en'));
}
