/**
 * Per-instance helpers that cost no Firestore reads or writes (unit-tested). Callables are capped
 * at CALLABLE_MAX_INSTANCES instances, so an effective limit is at most that multiple of the value
 * configured here. Entries are bounded so a burst of distinct keys cannot grow memory without limit.
 */

/**
 * Off in the emulator suite, like App Check: integration tests poll these read paths in tight
 * loops. The limiter itself is unit-tested (test/memory-limits.test.mjs).
 */
export const MEMORY_LIMITS_ENABLED = process.env.FUNCTIONS_EMULATOR !== 'true';

/** Fixed-window counter per key, for cheap read paths that must not write a quota document. */
export class WindowLimiter {
  private readonly hits = new Map<string, { window: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly maxKeys = 20_000) {}

  allow(key: string, now = Date.now()): boolean {
    const window = Math.floor(now / this.windowMs);
    const entry = this.hits.get(key);
    if (entry?.window === window) {
      if (entry.count >= this.limit) return false;
      entry.count += 1;
      return true;
    }
    if (!entry && this.hits.size >= this.maxKeys) {
      for (const [stale, value] of this.hits) if (value.window !== window) this.hits.delete(stale);
      if (this.hits.size >= this.maxKeys) this.hits.clear();
    }
    this.hits.set(key, { window, count: 1 });
    return true;
  }
}

/** Small time-based cache; the oldest entry is evicted first when it is full. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  constructor(private readonly maxEntries = 500) {}

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) { this.entries.delete(key); return undefined; }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expires: now + ttlMs });
  }
}
