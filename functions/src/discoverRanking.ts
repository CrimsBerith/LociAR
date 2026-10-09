/**
 * Keşfet ordering (growth plan 3.1). The first discover page is the newest page of public posts
 * re-ordered by engagement with time decay, so a liked or discussed post stays visible longer
 * than a silent one. Pagination is unchanged: the cursor still follows `created_at`, so later
 * pages continue chronologically after the oldest post of the first page and nothing is skipped.
 */
export function discoverScore(engagement: number, ageHours: number): number {
  const e = Number.isFinite(engagement) ? Math.max(0, engagement) : 0;
  const age = Number.isFinite(ageHours) ? Math.max(0, ageHours) : 0;
  return (1 + e) / Math.pow(age + 2, 1.5);
}

/** Stable: equal scores keep their incoming (newest-first) order. */
export function rankForDiscover<T>(items: readonly T[], read: (item: T) => { engagement: unknown; createdAtMs: number | null }, now: number): T[] {
  return items
    .map((item, index) => {
      const { engagement, createdAtMs } = read(item);
      const ageHours = createdAtMs == null ? 0 : (now - createdAtMs) / 3_600_000;
      return { item, index, score: discoverScore(Number(engagement ?? 0), ageHours) };
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(entry => entry.item);
}
