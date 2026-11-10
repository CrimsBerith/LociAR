/**
 * Zone-campaign (journey) rules shared by the callables and unit tests. The iOS client mirrors
 * the geometry in CampaignZone.swift; the admin panel validates the same step shape.
 */
import { distanceMeters } from './geo';
import { ENTRY_TOLERANCE_CAP_M, MAX_ENTRY_ACCURACY_M, type Fix } from './placeNoteRules';

export type Zone =
  | { kind: 'circle'; lat: number; lng: number; radius: number }
  | { kind: 'street'; points: Array<{ lat: number; lng: number }>; width: number };
export type Trigger = 'leave_usual_place' | 'enter' | 'dwell' | 'exit';
export type Schedule = { days: number[]; start: string; end: string; timezone: string };
export type Frequency = { kind: 'once' | 'daily' | 'hours'; hours?: number };
export type Step = {
  id: string; trigger: Trigger; zone?: Zone; dwellSeconds?: number; requires?: string; withinMinutes?: number;
  schedule?: Schedule; channels: { push: boolean; map: boolean; ar: boolean };
  title: string; message: string; code: { kind: 'none' | 'shared' | 'unique'; value?: string; prefix?: string };
  frequency: Frequency; budget?: number;
};
export type Progress = Record<string, { count: number; lastAt: number }>;

export const MAX_STEPS = 5;
export const MAX_DWELL_SECONDS = 1800;
/** Leaving the usual place is checked against the campaign area plus this margin. */
export const LEAVE_MARGIN_M = 1_000;

/** Metres from a point to the edge of a zone (negative inside a circle, 0 on a street centre line edge). */
export function zoneDistance(lat: number, lng: number, zone: Zone): number {
  if (zone.kind === 'circle') return distanceMeters(lat, lng, zone.lat, zone.lng) - zone.radius;
  let best = Infinity;
  for (let i = 0; i < zone.points.length - 1; i++) best = Math.min(best, segmentDistance(lat, lng, zone.points[i], zone.points[i + 1]));
  if (zone.points.length === 1) best = distanceMeters(lat, lng, zone.points[0].lat, zone.points[0].lng);
  return best - zone.width / 2;
}

/** Distance from a point to a short segment on a local flat projection (fine for street lengths). */
function segmentDistance(lat: number, lng: number, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = Math.cos(lat * Math.PI / 180) * 111_320, m = 111_320;
  const ax = (a.lng - lng) * k, ay = (a.lat - lat) * m, bx = (b.lng - lng) * k, by = (b.lat - lat) * m;
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Same tolerance as location notes: the uncertainty circle may touch the zone (at most 20 m). */
export function fixInsideZone(fix: Fix, zone: Zone): boolean {
  return fix.accuracy >= 0 && fix.accuracy <= MAX_ENTRY_ACCURACY_M && zoneDistance(fix.lat, fix.lng, zone) <= Math.min(fix.accuracy, ENTRY_TOLERANCE_CAP_M);
}

/** Clearly outside: even the near edge of the uncertainty circle is outside the zone. */
export function fixOutsideZone(fix: Fix, zone: Zone): boolean {
  return fix.accuracy >= 0 && fix.accuracy <= 100 && zoneDistance(fix.lat, fix.lng, zone) > fix.accuracy;
}

/** Centre and radius of a circle covering the zone, used for iOS wake regions. */
export function zoneBounds(zone: Zone): { lat: number; lng: number; radius: number } {
  if (zone.kind === 'circle') return { lat: zone.lat, lng: zone.lng, radius: zone.radius };
  const lat = zone.points.reduce((s, p) => s + p.lat, 0) / zone.points.length, lng = zone.points.reduce((s, p) => s + p.lng, 0) / zone.points.length;
  return { lat, lng, radius: Math.max(...zone.points.map(p => distanceMeters(lat, lng, p.lat, p.lng))) + zone.width / 2 };
}

/** Local weekday (0 = Sunday) and minutes since midnight in the schedule's time zone. */
export function localTime(now: number, timezone: string): { day: number; minutes: number; date: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}` };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Days and an hour window; a window ending before it starts runs past midnight. */
export function scheduleAllows(schedule: Schedule | undefined, now: number): boolean {
  if (!schedule) return true;
  const t = localTime(now, schedule.timezone), start = minutesOf(schedule.start), end = minutesOf(schedule.end);
  if (start <= end) return schedule.days.includes(t.day) && t.minutes >= start && t.minutes < end;
  if (t.minutes >= start) return schedule.days.includes(t.day);
  return t.minutes < end && schedule.days.includes((t.day + 6) % 7);
}

export function frequencyAllows(frequency: Frequency, previous: { count: number; lastAt: number } | undefined, now: number, timezone = 'UTC'): boolean {
  if (!previous || previous.count === 0) return true;
  if (frequency.kind === 'once') return false;
  if (frequency.kind === 'daily') return localTime(previous.lastAt, timezone).date !== localTime(now, timezone).date;
  return now - previous.lastAt >= (frequency.hours ?? 24) * 3_600_000;
}

/** A follow-up step needs its earlier step within `withinMinutes` (default 24 h). */
export function requirementMet(step: Step, progress: Progress, now: number): boolean {
  if (!step.requires) return true;
  const previous = progress[step.requires];
  return !!previous && previous.count > 0 && now - previous.lastAt <= (step.withinMinutes ?? 1440) * 60_000;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Unique code like LOCI-7F3K9Q; ambiguous letters (0/O, 1/I) are excluded. */
export function makeCode(prefix: string | undefined, random: (n: number) => Uint8Array): string {
  const bytes = random(6);
  return `${(prefix || 'LOCI').toUpperCase()}-${[...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}
