import 'server-only';
import { randomUUID } from 'node:crypto';
import { Timestamp, FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { anyBlocked } from './content-moderation';
import { emptyContent } from './content-models';
import { placement } from './content-ops';
import { distanceMeters } from './geo';
import { permissionsFor } from './rbac';
import { checkReceipt, ConflictError, derivedKey, mutationHash, requireActorAccountActive, requireTargetAccountActive, writeAudit } from './ops';
import { requiredString, uuid, ValidationError } from './validation';

async function access(tx: Transaction, actor: string, permission: string) {
  await requireActorAccountActive(tx, actor);
  const roles = await tx.get(adminDb().collection('admin_role_assignments').where('user_id', '==', actor).where('revoked_at', '==', null));
  if (!permissionsFor(roles.docs.map(d => String(d.get('role_key')))).has(permission)) throw new ConflictError('permission_revoked');
}
function numeric(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`Invalid ${name}`);
  return value;
}
function text(value: unknown, name: string, max: number) {
  const result = requiredString(value, name, 1, max);
  if (anyBlocked([result]) || /[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,63}(?:\b|$)/iu.test(result)) throw new ValidationError('Only moderated text without links is allowed');
  return result;
}
export type CampaignInput = { brandId: string; name: string; message: string; terms: string; lat: number; lng: number;
  radius: number; arrivalRadius: number; entryRadius: number; audienceMaxAgeMinutes: number; minPosts: number; minLikes: number; startsAt: number; endsAt: number };
export function campaignInput(body: Record<string, unknown>): CampaignInput {
  const start = typeof body.startsAt === 'string' ? Date.parse(body.startsAt) : body.startsAt;
  const end = typeof body.endsAt === 'string' ? Date.parse(body.endsAt) : body.endsAt;
  const startsAt = numeric(start, 'start', 0, 4_102_444_800_000), endsAt = numeric(end, 'end', startsAt + 60_000, startsAt + 90 * 86_400_000);
  if (endsAt <= Date.now()) throw new ValidationError('Campaign has already expired');
  const minPosts = numeric(body.minPosts ?? 0, 'post threshold', 0, 100), minLikes = numeric(body.minLikes ?? 0, 'like threshold', 0, 1_000_000);
  if (!Number.isInteger(minPosts) || !Number.isInteger(minLikes)) throw new ValidationError('Thresholds must be integers');
  return { brandId: uuid(body.brandId, 'brandId').toLowerCase(), name: text(body.name, 'name', 80), message: text(body.message, 'message', 1000),
    terms: text(body.terms, 'offer terms', 800), lat: numeric(body.lat, 'latitude', -90, 90), lng: numeric(body.lng, 'longitude', -180, 180),
    radius: numeric(body.radius ?? 1000, 'radius', 100, 5000), arrivalRadius: numeric(body.arrivalRadius ?? 150, 'wake radius', 100, 500),
    // Same GPS-tolerant rule as location notes: passing within ~radius + GPS error counts.
    entryRadius: Math.round(numeric(body.entryRadius ?? 30, 'entry radius', 15, 100)),
    // A user's last voluntarily shared location may be up to this old (default 24 h, e.g. at home).
    audienceMaxAgeMinutes: Math.round(numeric(body.audienceMaxAgeMinutes ?? 1440, 'location age', 2, 1440)), minPosts, minLikes, startsAt, endsAt };
}

export async function saveBrand(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const name = text(body.name, 'brand name', 80), author = uuid(body.authorId, 'authorId').toLowerCase();
  const member = body.memberId ? uuid(body.memberId, 'memberId').toLowerCase() : null;
  const memberActive = body.memberState !== 'revoked';
  if (body.memberState != null && !['active', 'revoked'].includes(String(body.memberState))) throw new ValidationError('Invalid member state');
  const id = body.brandId ? uuid(body.brandId, 'brandId').toLowerCase() : derivedKey(key, 'brand');
  const status = body.status === 'paused' ? 'paused' : 'active', db = adminDb();
  const hash = mutationHash(actor, 'brand_save', id, { name, author, member, memberActive, status, reason });
  return db.runTransaction(async tx => {
    await access(tx, actor, 'brands.write');
    const [receipt, before, profile] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('brands').doc(id), db.collection('profiles').doc(author));
    if (checkReceipt(receipt, hash)) return { id };
    await requireTargetAccountActive(tx, author);
    if (!profile.exists || profile.get('deleted_at') || profile.get('suspended')) throw new ConflictError('brand_author_unavailable');
    if (before.exists && before.get('author_luid') !== author) throw new ConflictError('Brand identity cannot be changed');
    if (member && memberActive) { await requireTargetAccountActive(tx, member); const m = await tx.get(db.collection('profiles').doc(member)); if (!m.exists || m.get('suspended')) throw new ConflictError('member_unavailable'); }
    tx.set(before.ref, { name, author_luid: author, status, updated_at: FieldValue.serverTimestamp(),
      ...(!before.exists ? { created_at: FieldValue.serverTimestamp(), created_by_admin: actor } : {}) }, { merge: true });
    if (member) tx.set(db.collection('brand_memberships').doc(`${id}_${member}`), { brand_id: id, owner_luid: member, role: 'editor', active: memberActive, granted_by: actor, created_at: FieldValue.serverTimestamp() });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'brand_save', resourceType: 'brand', resourceId: id,
      after: { name, author, member, memberActive, status }, reason, permissionKey: 'brands.write', riskLevel: 'sensitive' });
    return { id };
  });
}

export async function createCampaign(input: CampaignInput, actor: string, reason: string, key: string) {
  const id = derivedKey(key, 'campaign'), db = adminDb(), hash = mutationHash(actor, 'campaign_create', id, { input, reason });
  return db.runTransaction(async tx => {
    await access(tx, actor, 'campaigns.write');
    const [receipt, brand] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('brands').doc(input.brandId));
    if (checkReceipt(receipt, hash)) return { id };
    if (!brand.exists || brand.get('status') !== 'active') throw new ConflictError('brand_unavailable');
    await requireTargetAccountActive(tx, brand.get('author_luid'));
    tx.create(db.collection('campaigns').doc(id), { ...input, brand_id: input.brandId, author_luid: brand.get('author_luid'), status: 'draft', created_by_admin: actor,
      starts_at: Timestamp.fromMillis(input.startsAt), ends_at: Timestamp.fromMillis(input.endsAt), created_at: FieldValue.serverTimestamp() });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'campaign_create', resourceType: 'campaign', resourceId: id,
      after: { brandId: input.brandId, status: 'draft' }, reason, permissionKey: 'campaigns.write', riskLevel: 'sensitive' });
    return { id };
  });
}

export async function campaignStatus(id: string, status: 'active' | 'paused', actor: string, reason: string, key: string) {
  const db = adminDb(), hash = mutationHash(actor, 'campaign_status', id, { status, reason });
  return db.runTransaction(async tx => {
    await access(tx, actor, 'campaigns.write');
    const [receipt, campaign] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('campaigns').doc(id));
    if (checkReceipt(receipt, hash)) return { id };
    if (!campaign.exists) throw new ValidationError('campaign_not_found');
    const c = campaign.data()!, brand = await tx.get(db.collection('brands').doc(c.brand_id));
    if (!brand.exists || brand.get('status') !== 'active') throw new ConflictError('brand_unavailable');
    const author = await tx.get(db.collection('profiles').doc(brand.get('author_luid')));
    await requireTargetAccountActive(tx, brand.get('author_luid'));
    if (!author.exists || author.get('suspended')) throw new ConflictError('brand_author_unavailable');
    if (status === 'active') {
      if ((await tx.get(db.collection('system').doc('flags'))).get('kill_switch') === true) throw new ConflictError('service_paused');
      if (c.ends_at.toMillis() <= Date.now()) throw new ConflictError('campaign_expired');
      const zones = await tx.get(db.collection('protected_zones').where('active', '==', true));
      if (zones.docs.some(z => z.get('policy') === 'hard_block' && distanceMeters(c.lat, c.lng, z.get('lat'), z.get('lng')) <= z.get('radius_meters'))) throw new ConflictError('protected_zone');
    }
    const data = { ...placement({ ...emptyContent, authorId: author.id, lat: c.lat, lng: c.lng, text: c.message }, id),
      creator_id: author.id, creator_handle: brand.get('name'), caption: c.message, is_anonymous: false,
      edit_data_json: JSON.stringify({ version: 1, layers: [{ id: derivedKey(id, 'text'), type: 'text', text: `${c.message}\n\n${c.terms}` }] }),
      age_rating: 'all', visibility: 'private', status, created_at: c.created_at, deleted_at: null,
      sponsorship: { brand_name: brand.get('name'), terms: c.terms, expires_at: c.ends_at.toDate().toISOString() } };
    tx.update(campaign.ref, { status, post_projection: data, updated_at: FieldValue.serverTimestamp(), approved_by: actor });
    tx.set(db.collection('campaign_locations').doc(id), { campaign_name: c.name, author_luid: author.id, latitude: c.lat, longitude: c.lng, status, created_at: c.created_at });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'campaign_status', resourceType: 'campaign', resourceId: id,
      after: { status }, reason, permissionKey: 'campaigns.write', riskLevel: 'sensitive' });
    return { id };
  });
}

/** Reads only bounded recent post statistics; display-counter offsets do not earn rewards. */
/** Push-now and departure need a current position (2 min); map and arrival may use the campaign's location age. */
const locationAgeMs = (c: FirebaseFirestore.DocumentData, mode?: unknown) =>
  mode === 'immediate' || mode === 'departure' ? 120_000 : Number(c.audienceMaxAgeMinutes ?? 2) * 60_000;

async function eligibility(tx: Transaction, c: FirebaseFirestore.DocumentData, luid: string, now: number, maxAgeMs = locationAgeMs(c)) {
  if ((await tx.get(adminDb().collection('account_deletion_jobs').doc(luid))).exists) return null;
  const db = adminDb(), [profile, pref, location] = await tx.getAll(db.collection('profiles').doc(luid), db.collection('user_data_preferences').doc(luid), db.collection('user_locations').doc(luid));
  if (!profile.exists || profile.get('deleted_at') || profile.get('suspended') || profile.get('admin_managed') || pref.get('promotions') !== true || pref.get('location') !== true
    || !location.exists || location.get('consent_revision') !== pref.get('revision')
    || !(location.get('measured_at') instanceof Timestamp) || now - location.get('measured_at').toMillis() > maxAgeMs
    || location.get('measured_at').toMillis() > now + 10_000 || !(location.get('expires_at') instanceof Timestamp)
    || location.get('expires_at').toMillis() <= now || !Number.isFinite(location.get('accuracy')) || location.get('accuracy') < 0 || location.get('accuracy') > 200) return null;
  const distance = distanceMeters(c.lat, c.lng, location.get('lat'), location.get('lng'));
  if (!Number.isFinite(distance) || distance + location.get('accuracy') > c.radius) return null;
  const posts = await tx.get(db.collection('posts').where('creator_id', '==', luid).orderBy('created_at', 'desc').limit(100));
  const approved = posts.docs.filter(p => p.get('status') === 'active' && p.get('visibility') === 'public' && !p.get('deleted_at') && p.get('age_rating') !== '18_plus');
  const bestLikes = Math.max(0, ...approved.map(p => {
    const offset = p.get('metrics_counter_offsets')?.likes_count;
    if (p.get('metrics_admin_edited_at') && !Number.isSafeInteger(offset)) return 0;
    return Math.max(0, Number(p.get('likes_count') ?? 0) - (Number.isSafeInteger(offset) ? offset : 0));
  }));
  if (approved.length < c.minPosts || bestLikes < c.minLikes) return null;
  return { luid, handle: String(profile.get('handle') ?? ''), distance: Math.round(distance), measuredAt: location.get('measured_at').toDate().toISOString(), approvedPosts: approved.length, bestLikes, arrivals: pref.get('arrivals') === true, departures: pref.get('departures') === true };
}

export async function campaignAudience(id: string, actor: string, reason: string, after?: string) {
  const db = adminDb();
  return db.runTransaction(async tx => {
    await access(tx, actor, 'campaigns.audience'); await access(tx, actor, 'users.location.read');
    const campaign = await tx.get(db.collection('campaigns').doc(id));
    if (!campaign.exists) throw new ValidationError('campaign_not_found');
    const query = db.collection('user_locations').orderBy('__name__');
    const locations = await tx.get((after ? query.startAfter(uuid(after, 'cursor')) : query).limit(26));
    const candidates = [];
    for (const record of locations.docs.slice(0, 25)) { const candidate = await eligibility(tx, campaign.data()!, record.id, Date.now()); if (candidate) candidates.push(candidate); }
    writeAudit(tx, randomUUID(), { actorId: actor, action: 'campaign_audience_read', resourceType: 'campaign', resourceId: id,
      after: { matched: candidates.length, scanned: Math.min(locations.size, 25) }, reason, permissionKey: 'campaigns.audience', riskLevel: 'sensitive' });
    return { candidates, next: locations.size > 25 ? locations.docs[24].id : null };
  });
}

export async function queueNotification(body: Record<string, unknown>, actor: string, reason: string, key: string) {
  const id = derivedKey(key, 'notification'), recipient = uuid(body.recipientId, 'recipientId').toLowerCase();
  const campaignId = body.campaignId ? uuid(body.campaignId, 'campaignId').toLowerCase() : null;
  const mode = body.notificationMode ?? 'immediate';
  if (typeof mode !== 'string' || !['immediate', 'map', 'arrival', 'departure'].includes(mode) || (!campaignId && mode !== 'immediate')) throw new ValidationError('Invalid notification mode');
  const title = campaignId && !body.title ? 'LociAR' : text(body.title, 'title', 80), message = campaignId && !body.message ? '' : text(body.message, 'message', 240);
  const departureRadius = mode === 'departure' ? numeric(body.departureRadius ?? 150, 'departure radius', 100, 500) : null;
  const db = adminDb(), hash = mutationHash(actor, 'notification_queue', recipient, { campaignId, title, message, mode, departureRadius, reason });
  return db.runTransaction(async tx => {
    await access(tx, actor, 'notifications.send');
    if (campaignId) { await access(tx, actor, 'campaigns.audience'); await access(tx, actor, 'users.location.read'); }
    const [receipt, profile, pref] = await tx.getAll(db.collection('admin_audit_log').doc(key), db.collection('profiles').doc(recipient), db.collection('user_data_preferences').doc(recipient));
    if (checkReceipt(receipt, hash)) return { id };
    await requireTargetAccountActive(tx, recipient);
    if (!profile.exists || profile.get('suspended') || profile.get('admin_managed') || pref.get('promotions') !== true) throw new ConflictError('recipient_has_not_opted_in');
    if (mode === 'arrival' && pref.get('arrivals') !== true) throw new ConflictError('recipient_has_not_opted_in_to_arrivals');
    if (mode === 'departure' && (pref.get('departures') !== true || typeof pref.get('departures_revision') !== 'string')) throw new ConflictError('recipient_has_not_opted_in_to_departures');
    let c, origin;
    if (campaignId) {
      const campaign = await tx.get(db.collection('campaigns').doc(campaignId)); c = campaign.data();
      if (!c || c.status !== 'active' || c.starts_at.toMillis() > Date.now() || c.ends_at.toMillis() <= Date.now()) throw new ConflictError('campaign_not_active');
      const brand = await tx.get(db.collection('brands').doc(c.brand_id));
      if (!brand.exists || brand.get('status') !== 'active') throw new ConflictError('brand_unavailable');
      if (!await eligibility(tx, c, recipient, Date.now(), locationAgeMs(c, mode))) throw new ConflictError('recipient_no_longer_eligible');
      if (mode === 'departure') {
        origin = await tx.get(db.collection('user_locations').doc(recipient));
        if (origin.get('accuracy') > departureRadius!) throw new ConflictError('departure_origin_too_uncertain');
      }
    }
    if (campaignId) {
      const [existingTarget, count] = await Promise.all([tx.get(db.collection('campaign_targets').doc(`${campaignId}_${recipient}`)),
        tx.get(db.collection('campaign_targets').where('owner_luid', '==', recipient).where('expires_at', '>', Timestamp.now()).count())]);
      if (!existingTarget.exists && count.data().count >= 50) throw new ConflictError('too_many_active_offers');
    }
    if (campaignId && mode !== 'immediate') {
      tx.set(db.collection('campaign_targets').doc(`${campaignId}_${recipient}`), { campaign_id: campaignId, owner_luid: recipient,
        state: 'assigned', notification_mode: mode, notification_title: title, notification_message: message, assigned_by: actor, created_at: FieldValue.serverTimestamp(), expires_at: c!.ends_at }, { merge: true });
      const departureRef = db.collection('campaign_departure_regions').doc(`${campaignId}_${recipient}`);
      if (mode === 'departure') tx.set(departureRef, { owner_luid: recipient, campaign_id: campaignId, lat: origin!.get('lat'), lng: origin!.get('lng'), radius: departureRadius,
        consent_revision: pref.get('departures_revision'), measured_at: origin!.get('measured_at'), created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Math.min(c!.ends_at.toMillis(), Date.now() + 86_400_000)) });
      else tx.delete(departureRef);
      // No notification or daily push quota is consumed until a verified arrival.
      writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'campaign_assign', resourceType: 'notification', resourceId: id,
        after: { campaignId, mode }, reason, permissionKey: 'notifications.send', riskLevel: 'sensitive' });
      return { id };
    }
    const day = new Date().toISOString().slice(0, 10), quota = await tx.get(db.collection('promotion_push_quota').doc(`${recipient}_${day}`));
    const previousIds: string[] = quota.get('activity_ids') ?? [];
    if (Number(quota.get('count') ?? 0) >= 3 && !previousIds.includes(id)) throw new ConflictError('daily_notification_limit');
    tx.set(quota.ref, { owner_luid: recipient, count: Number(quota.get('count') ?? 0) + 1,
      activity_ids: [...previousIds, id], expires_at: Timestamp.fromMillis(Date.now() + 2 * 86_400_000) });
    if (campaignId) tx.set(db.collection('campaign_targets').doc(`${campaignId}_${recipient}`), { campaign_id: campaignId, owner_luid: recipient,
      state: 'assigned', notification_mode: mode, notification_title: title, notification_message: message, assigned_by: actor, created_at: FieldValue.serverTimestamp(), expires_at: c!.ends_at }, { merge: true });
    if (campaignId) tx.delete(db.collection('campaign_departure_regions').doc(`${campaignId}_${recipient}`));
    tx.create(db.collection('admin_notification_jobs').doc(id), { recipient_id: recipient, owner_luid: recipient, campaign_id: campaignId,
      title, message, actor_uid: actor, consent_revision: pref.get('revision'), status: 'queued', created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 86_400_000) });
    tx.create(db.collection('activity_events').doc(`admin_${id}`), { kind: campaignId ? 'promotion' : 'admin_notice', anonymous: true, actor_id: null,
      recipient_id: recipient, post_id: campaignId, body: message || 'Sana özel bir kampanya var.', read_at: null,
      created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(Date.now() + 30 * 86_400_000) });
    writeAudit(tx, key, { requestHash: hash, actorId: actor, action: 'notification_queue', resourceType: 'notification', resourceId: id,
      after: { campaignId, kind: campaignId ? 'promotion' : 'admin_notice' }, reason, permissionKey: 'notifications.send', riskLevel: 'sensitive' });
    return { id };
  });
}
