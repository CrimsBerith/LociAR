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
  const count = state?.window === window ? Number(state.count ?? 0) : 0;
  if (count >= limit) return { allowed: false, next: { window, count } };
  return { allowed: true, next: { window, count: count + 1 } };
}

/** Auth token age check for sensitive callables (seconds since the last sign-in). */
export function isRecentAuth(authTimeSeconds: unknown, nowMs: number, maxAgeSeconds = 300): boolean {
  return typeof authTimeSeconds === 'number' && nowMs / 1000 - authTimeSeconds <= maxAgeSeconds;
}
