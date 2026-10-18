/** Render scalar values without invoking an object's user-defined string conversion. */
export function scalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
  return '';
}

/** Distinct values retain their keys when reordered; duplicate values receive distinct keys. */
export function withStableKeys<T>(items: readonly T[], identity: (item: T) => string): Array<{ key: string; value: T }> {
  const occurrences = new Map<string, number>();
  return items.map(value => {
    const id = identity(value), occurrence = occurrences.get(id) ?? 0;
    occurrences.set(id, occurrence + 1);
    return { key: JSON.stringify([id, occurrence]), value };
  });
}
