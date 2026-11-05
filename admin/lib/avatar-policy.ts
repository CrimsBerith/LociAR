/** Mirrors functions/src/avatarPolicy.ts so managed-avatar uploads use the same fail-closed gate. */
const LEVELS = ['UNKNOWN','VERY_UNLIKELY','UNLIKELY','POSSIBLE','LIKELY','VERY_LIKELY'];
type SafeSearch = { adult?: unknown; racy?: unknown; violence?: unknown; medical?: unknown } | null | undefined;

function level(value: unknown): number {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 5 ? value : 0;
  const index = LEVELS.indexOf(String(value));
  return index < 0 ? 0 : index;
}

export function judgeSafeSearch(annotation: SafeSearch): 'accepted'|'rejected' {
  if (!annotation || ['adult','racy','violence','medical'].some(key=>level(annotation[key as keyof NonNullable<SafeSearch>])===0)) return 'rejected';
  return level(annotation.adult)<3 && level(annotation.racy)<4 && level(annotation.violence)<4 && level(annotation.medical)<4 ? 'accepted' : 'rejected';
}

export function safeSearchSummary(annotation: SafeSearch) {
  return Object.fromEntries(['adult','racy','violence','medical'].map(key=>[key,LEVELS[level(annotation?.[key as keyof NonNullable<SafeSearch>])]]));
}
