export const SEED_GROUP_M = 6;
export const MAX_SEEDS_PER_GROUP = 3;

/** One combined physical pool. Loaded IDs are represented by their current live
 * coordinates once; an --only selection cannot hide neighbours in another batch. */
export function seedDensityConflicts(rows, livePosts, distanceMeters) {
  const points = new Map(livePosts.map(post => [post.id, post]));
  for (const row of rows) if (!row.loaded) points.set(row.id, row);
  const conflicts = new Map();
  for (const row of rows) {
    if (row.loaded) continue;
    let count = 1;
    for (const point of points.values()) {
      if (point.id !== row.id && distanceMeters(row.lat, row.lng, point.lat, point.lng) <= SEED_GROUP_M) count++;
    }
    if (count > MAX_SEEDS_PER_GROUP) conflicts.set(row.id, count);
  }
  return conflicts;
}

export function activeDensityPost(post, now = Date.now()) {
  if (post.visibility !== 'public' || post.deleted_at) return false;
  const end = post.ends_at;
  const endMs = typeof end?.toMillis === 'function' ? end.toMillis() : typeof end === 'string' || end instanceof Date ? Date.parse(end) : NaN;
  return !Number.isFinite(endMs) || endMs > now;
}
