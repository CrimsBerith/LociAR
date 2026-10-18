import 'server-only';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { anyBlocked, containsURL } from './content-moderation';
import { permissionsFor } from './rbac';
import { checkReceipt, ConflictError, mutationHash, requireActorAccountActive, writeAudit } from './ops';
import { requiredString, uuid, ValidationError } from './validation';
import { distanceMeters } from './geo';

/**
 * Zone-campaign steps, validated with the same shape functions/src/journeyRules.ts admits.
 * Up to five steps; each fires on leaving the usual place, entering, staying in or leaving a zone.
 */
export const TRIGGERS = ['leave_usual_place', 'enter', 'dwell', 'exit'] as const;
export type JourneyStep = {
  id: string; trigger: typeof TRIGGERS[number];
  zone?: { kind: 'circle'; lat: number; lng: number; radius: number } | { kind: 'street'; points: Array<{ lat: number; lng: number }>; width: number };
  dwellSeconds?: number; requires?: string; withinMinutes?: number;
  schedule?: { days: number[]; start: string; end: string; timezone: string };
  channels: { push: boolean; map: boolean; ar: boolean };
  title: string; message: string; code: { kind: 'none' | 'shared' | 'unique'; value?: string; prefix?: string };
  frequency: { kind: 'once' | 'daily' | 'hours'; hours?: number }; budget?: number;
};

function num(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${name} must be ${min}–${max}`);
  return value;
}
function plain(value: unknown, name: string, max: number): string {
  const s = requiredString(value, name, 1, max);
  if (anyBlocked([s]) || containsURL(s)) throw new ValidationError(`${name}: only moderated text without links`);
  return s;
}
const point = (p: unknown) => {
  const v = p as { lat?: unknown; lng?: unknown };
  return { lat: num(v?.lat, 'latitude', -90, 90), lng: num(v?.lng, 'longitude', -180, 180) };
};

export function parseSteps(raw: unknown, timezone: string): JourneyStep[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) throw new ValidationError('A campaign needs 1–5 steps');
  const ids = new Set<string>();
  const steps = raw.map((value, index): JourneyStep => {
    const s = value as Record<string, any>;
    const id = typeof s.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s.id) ? s.id : `s${index + 1}`;
    if (ids.has(id)) throw new ValidationError(`Duplicate step id ${id}`);
    ids.add(id);
    const trigger: JourneyStep['trigger'] = TRIGGERS.includes(s.trigger) ? s.trigger : (() => { throw new ValidationError(`Step ${id}: invalid trigger`); })();
    let zone: JourneyStep['zone'];
    if (trigger !== 'leave_usual_place') {
      if (s.zone?.kind === 'circle') zone = { kind: 'circle', ...point(s.zone), radius: Math.round(num(s.zone.radius, `Step ${id} radius`, 15, 2_000)) };
      else if (s.zone?.kind === 'street') {
        const points: Array<{ lat: number; lng: number }> = (Array.isArray(s.zone.points) ? s.zone.points : []).map(point);
        if (points.length < 2 || points.length > 20) throw new ValidationError(`Step ${id}: a street needs 2–20 points`);
        zone = { kind: 'street', points, width: Math.round(num(s.zone.width, `Step ${id} street width`, 10, 200)) };
        // One native wake circle covers this whole step, with a 50 m walking margin.
        const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
        const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
        if (Math.max(...points.map(p => distanceMeters(lat, lng, p.lat, p.lng))) + zone.width / 2 > 2_950) {
          throw new ValidationError(`Step ${id}: street exceeds the 3 km monitoring circle; split it into shorter steps`);
        }
      } else throw new ValidationError(`Step ${id}: a zone is required`);
    }
    const days: number[] = Array.isArray(s.schedule?.days) ? [...new Set<number>(s.schedule.days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const hhmm = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
    const schedule = s.schedule ? { days, start: hhmm(s.schedule.start) ?? '00:00', end: hhmm(s.schedule.end) ?? '23:59', timezone } : undefined;
    if (schedule && !schedule.days.length) throw new ValidationError(`Step ${id}: choose at least one day`);
    const codeKind = ['none', 'shared', 'unique'].includes(s.code?.kind) ? s.code.kind : 'none';
    const code = codeKind === 'shared' ? { kind: 'shared' as const, value: plain(s.code.value, `Step ${id} code`, 40) }
      : codeKind === 'unique' ? { kind: 'unique' as const, prefix: /^[A-Za-z0-9]{1,10}$/.test(String(s.code.prefix ?? '')) ? String(s.code.prefix).toUpperCase() : 'LOCI' }
      : { kind: 'none' as const };
    const fKind: 'once' | 'daily' | 'hours' = ['once', 'daily', 'hours'].includes(s.frequency?.kind) ? s.frequency.kind : 'once';
    const channels = { push: s.channels?.push !== false, map: s.channels?.map === true, ar: s.channels?.ar === true };
    if (!channels.push && !channels.map && !channels.ar) throw new ValidationError(`Step ${id}: choose at least one channel`);
    return {
      id, trigger, ...(zone ? { zone } : {}),
      ...(trigger === 'dwell' ? { dwellSeconds: Math.round(num(s.dwellSeconds ?? 60, `Step ${id} stay time`, 10, 1_800)) } : {}),
      ...(s.requires ? { requires: String(s.requires), withinMinutes: Math.round(num(s.withinMinutes ?? 360, `Step ${id} validity`, 5, 10_080)) } : {}),
      ...(schedule ? { schedule } : {}), channels,
      title: plain(s.title, `Step ${id} title`, 80), message: plain(s.message, `Step ${id} message`, 240), code,
      frequency: fKind === 'hours' ? { kind: 'hours', hours: Math.round(num(s.frequency.hours, `Step ${id} hours`, 1, 720)) } : { kind: fKind },
      ...(s.budget != null && s.budget !== '' ? { budget: Math.round(num(Number(s.budget), `Step ${id} budget`, 1, 1_000_000)) } : {}),
    };
  });
  const earlier = new Set<string>();
  for (const s of steps) {
    if (s.requires && !earlier.has(s.requires)) throw new ValidationError(`Step ${s.id}: unknown earlier step ${s.requires}`);
    earlier.add(s.id);
  }
  return steps;
}

async function access(tx: Transaction, actor: string, permission: string) {
  await requireActorAccountActive(tx, actor);
  const roles = await tx.get(adminDb().collection('admin_role_assignments').where('user_id', '==', actor).where('revoked_at', '==', null));
  if (!permissionsFor(roles.docs.map(d => String(d.get('role_key')))).has(permission)) throw new ConflictError('permission_revoked');
}

/** Turns a campaign into a zone campaign with these steps. Active campaigns refresh phones nearby. */
export async function saveCampaignSteps(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const id = uuid(body.campaignId, 'campaignId').toLowerCase();
  const timezone = typeof body.timezone === 'string' && body.timezone.length <= 64 ? body.timezone : 'Europe/Istanbul';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw new ValidationError('Unknown time zone'); }
  const steps = parseSteps(body.steps, timezone), db = adminDb(), hash = mutationHash(actor, 'campaign_steps', id, { steps, timezone, reason });
  return await db.runTransaction(async tx => {
    await access(tx, actor, 'campaigns.write');
    const [receipt, campaign] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('campaigns').doc(id));
    if (checkReceipt(receipt, hash)) return { id };
    if (!campaign.exists) throw new ValidationError('campaign_not_found');
    tx.update(campaign.ref, { audience: 'zone', steps: structuredClone(steps), timezone, updated_at: FieldValue.serverTimestamp() });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'campaign_steps', resourceType: 'campaign', resourceId: id,
      after: { stepCount: steps.length, triggers: steps.map(s => s.trigger) }, reason, permissionKey: 'campaigns.write', riskLevel: 'sensitive' });
    return { id };
  });
}

/** Marks a unique code as used at the counter; a code can be redeemed once. */
export async function redeemCode(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const code = requiredString(body.code, 'code', 3, 40).toUpperCase(), db = adminDb(), hash = mutationHash(actor, 'campaign_code_redeem', code, { reason });
  return await db.runTransaction(async tx => {
    await access(tx, actor, 'campaigns.write');
    const [receipt, doc] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('campaign_codes').doc(code));
    if (checkReceipt(receipt, hash)) return { code };
    if (!doc.exists) throw new ValidationError('code_not_found');
    if (doc.get('redeemed_at')) throw new ConflictError('code_already_redeemed');
    tx.update(doc.ref, { redeemed_at: FieldValue.serverTimestamp(), redeemed_by: actor });
    tx.set(db.collection('campaign_step_stats').doc(`${doc.get('campaign_id')}_${doc.get('step_id')}`), { redeemed: FieldValue.increment(1) }, { merge: true });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'campaign_code_redeem', resourceType: 'campaign', resourceId: String(doc.get('campaign_id')),
      after: { step: doc.get('step_id') }, reason, permissionKey: 'campaigns.write', riskLevel: 'sensitive' });
    return { code, campaignId: doc.get('campaign_id'), stepId: doc.get('step_id') };
  });
}

/** Sent and redeemed per step, in step order. */
export async function journeyFunnel(campaignId: string, steps: JourneyStep[]) {
  const stats = steps.length ? await adminDb().getAll(...steps.map(s => adminDb().collection('campaign_step_stats').doc(`${campaignId}_${s.id}`))) : [];
  return steps.map((s, i) => ({ id: s.id, trigger: s.trigger, title: s.title, sent: Number(stats[i]?.get('sent') ?? 0), redeemed: Number(stats[i]?.get('redeemed') ?? 0),
    lastAt: stats[i]?.get('updated_at') instanceof Timestamp ? stats[i].get('updated_at').toDate().toISOString() : null }));
}
