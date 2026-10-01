/** Pure SafeSearch policy for profile photos (kept separate so it is unit-testable). */
export const LEVELS = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'];

export type SafeSearch = { adult?: unknown; racy?: unknown; violence?: unknown; medical?: unknown; spoof?: unknown } | null | undefined;

export function level(value: unknown): number {
  if (typeof value === 'number') return value;
  const index = LEVELS.indexOf(String(value));
  return index < 0 ? 0 : index;
}

/** Stricter than post content: 18+ is hard-blocked, and avatars are shown everywhere. */
export function judgeSafeSearch(annotation: SafeSearch): 'accepted' | 'rejected' {
  if (!annotation) return 'rejected';
  const POSSIBLE = 3;
  const LIKELY = 4;
  if (level(annotation.adult) >= POSSIBLE) return 'rejected';
  if (level(annotation.racy) >= LIKELY) return 'rejected';
  if (level(annotation.violence) >= LIKELY) return 'rejected';
  if (level(annotation.medical) >= LIKELY) return 'rejected';
  return 'accepted';
}

