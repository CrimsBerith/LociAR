/** Pure helpers shared by triggers, handle changes and avatar uploads (unit-tested). */

export const HANDLE_COOLDOWN_MS = 30 * 24 * 3_600_000;

/** Returns the remaining cooldown in ms (0 when the handle may change now). */
export function handleCooldownRemaining(changedAtMs: number | null | undefined, nowMs: number): number {
  if (!changedAtMs || !Number.isFinite(changedAtMs)) return 0;
  return Math.max(0, changedAtMs + HANDLE_COOLDOWN_MS - nowMs);
}

/** Counter value after applying `delta`, never below zero. */
export function clampedNext(current: unknown, delta: number): number {
  const base = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  return Math.max(0, base + delta);
}

export type WindowState = { window: number; count: number };

/** Fixed-window counter: returns whether one more event is allowed and the next state. */
export function bumpWindow(state: Partial<WindowState> | undefined, nowMs: number, windowMs: number, limit: number): { allowed: boolean; next: WindowState } {
  const window = Math.floor(nowMs / windowMs);
  const stored = state?.window === window ? Number(state.count ?? 0) : 0;
  // A corrupted counter (NaN, negative) fails closed instead of comparing false and allowing forever.
  if (!Number.isFinite(stored) || stored < 0) return { allowed: false, next: { window, count: limit } };
  const count = stored;
  if (count >= limit) return { allowed: false, next: { window, count } };
  return { allowed: true, next: { window, count: count + 1 } };
}

/** Auth token age check for sensitive callables (seconds since the last sign-in). */
export function isRecentAuth(authTimeSeconds: unknown, nowMs: number, maxAgeSeconds = 300): boolean {
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds) || authTimeSeconds <= 0) return false;
  const age = nowMs / 1000 - authTimeSeconds;
  // A sign-in time in the future (beyond small clock skew) is not "recent".
  return age >= -60 && age <= maxAgeSeconds;
}
