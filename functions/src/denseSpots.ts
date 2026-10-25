import { onCall } from 'firebase-functions/v2/https';
import { db, Timestamp, FieldValue, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES } from './core';
import { requireActiveAccount } from './profileGuard';
import { isPublicActive } from './counters';
import { distanceMeters, encodeGeohash } from './geo';
import { geoCandidates } from './geoQuery';
import { createHash, randomUUID } from 'node:crypto';
import { splitSpotPlan } from './mapNoteGroups';
import {
  distanceToSpot, fixIsFresh, fixUnlocksSpot, joinSpot, spotOf, validCoordinates, DEFAULT_DENSE_THRESHOLD, DEFAULT_UNLOCK_RADIUS_M,
  MAX_ENTRY_ACCURACY_M, MAX_SPOT_RADIUS_M, MAX_UNLOCK_RADIUS_M, MIN_SPOT_SIZE, MIN_UNLOCK_RADIUS_M, SPOT_JOIN_RADIUS_M,
  UNLOCK_TOLERANCE_CAP_M, UNLOCK_TTL_MS, type Fix, type Spot,
} from './placeNoteRules';

/**
 * Spots are server-only clusters of public posts within 25 m of a fixed centre.
 * A spot holding at least `dense_threshold` posts is dense: its text opens
 * only on site. A server-only membership record survives deletion until the count is settled.
 */
export type SpotSettings = { denseThreshold: number; unlockRadius: number };

export async function spotSettings(tx?: FirebaseFirestore.Transaction): Promise<SpotSettings> {
  const ref = db.collection('system').doc('place_notes');
  const doc = tx ? await tx.get(ref) : await ref.get();
  const threshold = doc.get('dense_threshold'), radius = doc.get('unlock_radius_m');
  return {
    denseThreshold: Number.isInteger(threshold) && threshold >= MIN_SPOT_SIZE ? threshold : DEFAULT_DENSE_THRESHOLD,
    unlockRadius: typeof radius === 'number' && radius >= MIN_UNLOCK_RADIUS_M && radius <= MAX_UNLOCK_RADIUS_M ? radius : DEFAULT_UNLOCK_RADIUS_M,
  };
}

const spots = () => db.collection('note_spots');
const memberRef = (postId: string) => db.collection('note_spot_members').doc(postId);
const unlockRef = (luid: string, spot: string) => db.collection('dense_spot_unlocks').doc(`${luid}_${spot}`);
export const spotReceiptRef = (luid: string, spot: string) => db.collection('dense_spot_receipts').doc(`${luid}_${spot}`);
type SpotDoc = Spot & { id: string; count: number; groupId?: string; post_ids?: string[] };
const spotData = (d: FirebaseFirestore.DocumentSnapshot): SpotDoc => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng'), radius: d.get('radius'), count: Number(d.get('count') ?? 0) });

async function spotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number): Promise<SpotDoc[]> {
  return (await geoCandidates(tx, spots(), lat, lng, radius + MAX_SPOT_RADIUS_M)).map(spotData)
    .filter(s => distanceToSpot(lat, lng, s) <= radius);
}

/**
 * Keeps a post's spot membership in step with its live state: leaves its spot when it stops
 * being public or moves away, joins the nearest spot within 25 m, or seeds a new spot when at
 * least five unclustered public posts lie within 25 m.
 */
export async function syncSpotMembership(postId: string) {
  await db.runTransaction(async tx => {
    const ref = db.collection('posts').doc(postId);
    const [post, member] = await tx.getAll(ref, memberRef(postId)), data = post.data();
    const counted = !!data && isPublicActive(data) && validCoordinates(data.lat, data.lng);
    const currentId = existingSpotId(member, data);
    const current = currentId ? await tx.get(spots().doc(currentId)) : null;
    const stillInside = counted && current?.exists && distanceMeters(data!.lat, data!.lng, current.get('lat'), current.get('lng')) <= SPOT_JOIN_RADIUS_M;
    if (stillInside) {
      restoreSpotMember(tx, member, postId, currentId!, data!.creator_id);
      return;
    }
    const nearby = counted ? await spotsNear(tx, data!.lat, data!.lng, SPOT_JOIN_RADIUS_M) : [];
    const candidates = counted && !nearby.length ? await geoCandidates(tx, db.collection('posts'), data!.lat, data!.lng, SPOT_JOIN_RADIUS_M) : [];
    // Reads are done; writes follow. The old spot loses the post unless it rejoins that same spot.
    nearby.sort((a, b) => distanceMeters(data!.lat, data!.lng, a.lat, a.lng) - distanceMeters(data!.lat, data!.lng, b.lat, b.lng));
    const best = nearby[0];
    if (current?.exists && best?.id !== currentId) tx.update(current.ref, { count: FieldValue.increment(-1), updated_at: FieldValue.serverTimestamp() });
    if (!counted) {
      clearSpotMembership(tx, post, member, Boolean(post.exists && data?.spot_id));
      return;
    }
    if (best?.id === currentId) return;
    if (best) {
      const next = joinSpot(best, data!.lat, data!.lng);
      tx.update(spots().doc(best.id), { ...next, geohash: encodeGeohash(next.lat, next.lng, 9), updated_at: FieldValue.serverTimestamp() });
      tx.update(ref, { spot_id: best.id });
      tx.set(member.ref, { post_id: postId, spot_id: best.id, owner_luid: data!.creator_id });
      return;
    }
    seedSpot(tx, post, member, candidates, data!, currentId);
  });
}

function restoreSpotMember(tx: FirebaseFirestore.Transaction, member: FirebaseFirestore.DocumentSnapshot, postId: string, spotId: string, owner: string) {
  if (!member.exists) tx.set(member.ref, { post_id: postId, spot_id: spotId, owner_luid: owner });
}

function existingSpotId(member: FirebaseFirestore.DocumentSnapshot, data: FirebaseFirestore.DocumentData | undefined): string | null {
  const id = member.get('spot_id');
  if (typeof id === 'string') return id;
  return typeof data?.spot_id === 'string' ? data.spot_id : null;
}

function clearSpotMembership(tx: FirebaseFirestore.Transaction, post: FirebaseFirestore.DocumentSnapshot,
  member: FirebaseFirestore.DocumentSnapshot, clearPost: boolean) {
  if (clearPost) tx.update(post.ref, { spot_id: FieldValue.delete() });
  if (member.exists) tx.delete(member.ref);
}

function seedSpot(tx: FirebaseFirestore.Transaction, post: FirebaseFirestore.DocumentSnapshot,
  member: FirebaseFirestore.DocumentSnapshot, candidates: FirebaseFirestore.QueryDocumentSnapshot[], data: FirebaseFirestore.DocumentData, currentId: string | null) {
  const members = candidates.filter(d => (d.id === post.id || !d.get('spot_id')) && isPublicActive(d.data())
    && validCoordinates(d.get('lat'), d.get('lng')) && distanceMeters(data.lat, data.lng, d.get('lat'), d.get('lng')) <= SPOT_JOIN_RADIUS_M);
  if (!members.some(d => d.id === post.id)) members.push(post as FirebaseFirestore.QueryDocumentSnapshot);
  if (members.length < MIN_SPOT_SIZE) {
    if (currentId) tx.update(post.ref, { spot_id: FieldValue.delete() });
    if (member.exists) tx.delete(member.ref);
    return;
  }
  // Two writes per member, still below Firestore's 500-write transaction budget.
  // Keep the seed first: spotOf may retain this fixed centre when the mean would exclude a member.
  const selected = [post, ...members.filter(d => d.id !== post.id)].slice(0, 200);
  const spot = spotOf(selected.map(d => ({ lat: d.get('lat'), lng: d.get('lng') }))), spotRef = spots().doc(post.id);
  tx.set(spotRef, { ...spot, geohash: encodeGeohash(spot.lat, spot.lng, 9), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
  for (const m of selected) {
    tx.update(m.ref, { spot_id: spotRef.id });
    tx.set(memberRef(m.id), { post_id: m.id, spot_id: spotRef.id, owner_luid: m.get('creator_id') });
  }
}

/** Idempotent legacy repair: derive the count from live source posts, never a historical delta. */
export async function repairSpotCount(spotId: string) {
  await db.runTransaction(async tx => {
    const spot = await tx.get(spots().doc(spotId));
    if (!spot.exists) return;
    const posts = await tx.get(db.collection('posts').where('spot_id', '==', spotId)
      .select('status', 'visibility', 'age_rating', 'deleted_at'));
    const count = posts.docs.filter(post => isPublicActive(post.data())).length;
    if (spot.get('count') !== count) tx.update(spot.ref, { count, updated_at: FieldValue.serverTimestamp() });
  });
}

/**
 * OFFLINE Admin entry point, deliberately not exported from index.ts or called by any reader.
 * Default is a read-only preview. Apply requires paused post/spot writers (including triggers).
 * Journaled assignments survive interruption; every mutation checks a renewable fencing token.
 * Nothing deletes posts. Keep the journal for audit/resume; do not reset a completed journal.
 */
export async function splitLegacySpot(spotId: string, options: { apply?: boolean; writesPaused?: boolean } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(spotId)) throw new Error('Invalid spot ID');
  if (options.apply && options.writesPaused !== true) throw new Error('Pause post/spot writers before applying a split');
  const journal = db.collection('note_spot_migrations').doc(spotId), owner = randomUUID();
  const previous = await journal.get();
  if (previous.get('phase') === 'complete') return { spotId, phase: 'complete', groups: previous.get('group_count'), applied: false };
  let plan: ReturnType<typeof splitSpotPlan> = [], records: Array<Record<string, unknown>> = [];
  let planHash = previous.get('plan_hash') as string | undefined;
  const resume = previous.get('phase') === 'planned';
  if (!resume) {
    const [source, posts, members] = await Promise.all([spots().doc(spotId).get(),
      db.collection('posts').where('spot_id', '==', spotId).get(),
      db.collection('note_spot_members').where('spot_id', '==', spotId).get()]);
    if (!source.exists) throw new Error('Source spot is missing');
    const active = posts.docs.filter(d => isPublicActive(d.data()));
    plan = splitSpotPlan(spotId, spotData(source), active.map(d => ({ id: d.id, lat: d.get('lat'), lng: d.get('lng') })));
    const targetByPost = new Map(plan.flatMap(g => g.post_ids.map(id => [id, g.id] as const)));
    const postIds = new Set(posts.docs.map(d => d.id));
    records = posts.docs.map(d => ({ post_id: d.id, target_id: targetByPost.get(d.id) ?? null,
      lat: d.get('lat') ?? null, lng: d.get('lng') ?? null, public_active: isPublicActive(d.data()), source_post: true, done: false }));
    records.push(...members.docs.filter(d => !postIds.has(d.id)).map(d => ({ post_id: d.id, target_id: null, source_post: false, done: false })));
    planHash = createHash('sha256').update(JSON.stringify([source.updateTime, plan, records,
      posts.docs.map(d => [d.id, d.updateTime]), members.docs.map(d => [d.id, d.updateTime])])).digest('hex');
    if (previous.exists && previous.get('plan_hash') !== planHash) throw new Error('Source changed during preparation; review the preserved journal');
  }
  const preview = { spotId, phase: resume ? 'planned' : 'preview', groups: resume ? previous.get('group_count') : plan.length,
    posts: resume ? previous.get('post_count') : records.length, applied: false };
  if (!options.apply) return preview;
  const leaseMs = 5 * 60_000;
  await db.runTransaction(async tx => {
    const current = await tx.get(journal);
    if (current.get('phase') === 'complete') throw new Error('Split already completed; refresh the preview');
    if (current.exists && current.get('plan_hash') !== planHash) throw new Error('Split plan changed; refresh the preview');
    if (current.get('lease_until') instanceof Timestamp && current.get('lease_until').toMillis() > Date.now()) throw new Error('Another split worker holds the lease');
    tx.set(journal, { source_spot_id: spotId, plan_hash: planHash, phase: resume ? 'planned' : 'preparing',
      group_count: preview.groups, post_count: preview.posts, lease_owner: owner,
      lease_until: Timestamp.fromMillis(Date.now() + leaseMs) }, { merge: true });
  });
  const fenced = async (tx: FirebaseFirestore.Transaction) => {
    const current = await tx.get(journal);
    if (current.get('lease_owner') !== owner || current.get('phase') === 'complete'
      || !(current.get('lease_until') instanceof Timestamp) || current.get('lease_until').toMillis() <= Date.now()) {
      throw new Error('Split worker lost its lease');
    }
  };
  const renew = (tx: FirebaseFirestore.Transaction) => tx.update(journal, { lease_until: Timestamp.fromMillis(Date.now() + leaseMs) });
  if (!resume) {
    const writes = [...plan.map(g => ({ ref: journal.collection('groups').doc(g.id), data: { ...g, post_ids: FieldValue.delete() } })),
      ...records.map(r => ({ ref: journal.collection('members').doc(String(r.post_id)), data: r }))];
    for (let start = 0; start < writes.length; start += 200) {
      await db.runTransaction(async tx => {
        await fenced(tx);
        for (const write of writes.slice(start, start + 200)) tx.set(write.ref, write.data, { merge: true });
        renew(tx);
      });
    }
    await db.runTransaction(async tx => { await fenced(tx); tx.update(journal, { phase: 'planned' }); renew(tx); });
  }
  const groupDocs = await journal.collection('groups').get();
  for (const group of groupDocs.docs) {
    await db.runTransaction(async tx => {
      await fenced(tx);
      const target = await tx.get(spots().doc(group.id));
      if (group.id !== spotId) {
        if (target.exists && target.get('split_source') !== spotId) throw new Error('Split target ID collision');
        if (!target.exists) tx.set(target.ref, { lat: group.get('lat'), lng: group.get('lng'), radius: group.get('radius'), count: 0,
          geohash: encodeGeohash(group.get('lat'), group.get('lng'), 9), split_source: spotId,
          membership_version: 2, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
      }
      renew(tx);
    });
  }
  const assignments = await journal.collection('members').get();
  for (const assignment of assignments.docs) {
    await db.runTransaction(async tx => {
      await fenced(tx);
      const [entry, post, member] = await tx.getAll(assignment.ref, db.collection('posts').doc(assignment.id), memberRef(assignment.id));
      if (entry.get('done') === true) { renew(tx); return; }
      const target = entry.get('target_id') as string | null;
      if (post.exists && entry.get('source_post')) {
        if (![spotId, target].includes(post.get('spot_id')) || isPublicActive(post.data()!) !== entry.get('public_active')
          || (target && (post.get('lat') !== entry.get('lat') || post.get('lng') !== entry.get('lng')))) {
          throw new Error('Post changed during offline split; keep writers paused and review the journal');
        }
        if (target) {
          tx.update(post.ref, { spot_id: target });
          tx.set(member.ref, { post_id: post.id, spot_id: target, owner_luid: post.get('creator_id') });
        } else {
          tx.update(post.ref, { spot_id: FieldValue.delete() });
          if (member.exists && member.get('spot_id') === spotId) tx.delete(member.ref);
        }
      } else if (member.exists && member.get('spot_id') === spotId) tx.delete(member.ref);
      tx.update(entry.ref, { done: true });
      renew(tx);
    });
  }
  // Recompute, never increment/decrement historical counters. Include an emptied source spot.
  const targets = new Map(groupDocs.docs.map(g => [g.id, g.data()]));
  if (!targets.has(spotId)) targets.set(spotId, {});
  for (const [id, geometry] of targets) {
    await db.runTransaction(async tx => {
      await fenced(tx);
      const [target, posts] = await Promise.all([tx.get(spots().doc(id)), tx.get(db.collection('posts').where('spot_id', '==', id))]);
      const active = posts.docs.filter(d => isPublicActive(d.data()));
      if (!target.exists || active.some(d => distanceToSpot(d.get('lat'), d.get('lng'), spotData(target)) > SPOT_JOIN_RADIUS_M)) {
        throw new Error('Split target geometry changed; review the journal');
      }
      tx.update(target.ref, { count: active.length, radius: geometry.radius ?? 0, membership_version: 2, updated_at: FieldValue.serverTimestamp() });
      renew(tx);
    });
  }
  await db.runTransaction(async tx => {
    await fenced(tx);
    tx.update(journal, { phase: 'complete', completed_at: FieldValue.serverTimestamp(), lease_until: Timestamp.fromMillis(0) });
  });
  return { ...preview, phase: 'complete', applied: true };
}

export type SpotLock = { spot: string; count: number; lat: number; lng: number; unlockRadius: number; groupId?: string };

/** Every location note needs a fresh on-site fix, including single notes and small groups.
 * Existing AR dense spots retain their separate, time-limited unlock policy. */
export async function denseLocks(docs: FirebaseFirestore.DocumentSnapshot[], viewer: string, fix?: Fix, readArea?: SpotDoc): Promise<Map<string, SpotLock>> {
  const locks = new Map<string, SpotLock>();
  const candidates = docs.filter(d => d.get('creator_id') !== viewer
    && (typeof d.get('spot_id') === 'string' || d.get('note_kind') === 'location'));
  if (!candidates.length) return locks;
  const ids = [...new Set(candidates.flatMap(d => typeof d.get('spot_id') === 'string' ? [String(d.get('spot_id'))] : []))];
  const settings = await spotSettings();
  const found = ids.length ? await db.getAll(...ids.map(id => spots().doc(id))) : [];
  const existing = found.filter(s => s.exists).map(spotData);
  const dense = existing.filter(s => s.count >= settings.denseThreshold);
  const unlocks = dense.length ? await db.getAll(...dense.map(s => unlockRef(viewer, s.id))) : [], now = Date.now();
  const open = new Set(dense.filter((_, i) => unlocks[i].exists && unlocks[i].get('expires_at') instanceof Timestamp && unlocks[i].get('expires_at').toMillis() > now).map(s => s.id));
  const byId = new Map(existing.map(s => [s.id, s]));
  const fresh = fix && fixIsFresh(fix, now) && fix.accuracy <= MAX_ENTRY_ACCURACY_M ? fix : undefined;
  for (const post of candidates) {
    const spot = byId.get(String(post.get('spot_id')));
    const lock = post.get('note_kind') === 'location'
      ? locationNoteLock(post, settings, spot, readArea, fresh)
      : arPostLock(spot, settings, open, fresh);
    if (lock) locks.set(post.id, lock);
  }
  return locks;
}

function locationNoteLock(post: FirebaseFirestore.DocumentSnapshot, settings: SpotSettings,
  spot: SpotDoc | undefined, readArea: SpotDoc | undefined, fresh: Fix | undefined): SpotLock | undefined {
  const point = { id: post.id, count: 1, lat: post.get('lat'), lng: post.get('lng'), radius: 0 };
  // An area is an access grant only for its explicitly selected, geometrically valid members.
  const area = readArea?.post_ids?.includes(post.id)
    && distanceToSpot(point.lat, point.lng, readArea) <= SPOT_JOIN_RADIUS_M ? readArea : undefined;
  const place = area ?? spot ?? point;
  // Historical spot circles never authorize current note bodies; group reads supply live geometry.
  if (fresh && fixUnlocksSpot(fresh, area ?? point, settings.unlockRadius)) return undefined;
  return { spot: place.id, count: place.count, lat: place.lat, lng: place.lng, unlockRadius: settings.unlockRadius,
    groupId: area?.groupId ?? `${spot ? 'spot' : 'post'}:${place.id}` };
}

function arPostLock(spot: SpotDoc | undefined, settings: SpotSettings, open: Set<string>, fresh: Fix | undefined): SpotLock | undefined {
  if (!spot || spot.count < settings.denseThreshold || open.has(spot.id)
    || (fresh && fixUnlocksSpot(fresh, spot, settings.unlockRadius))) return undefined;
  return { spot: spot.id, count: spot.count, lat: spot.lat, lng: spot.lng, unlockRadius: settings.unlockRadius };
}

/** Dense spots whose circle lies within `radius` of the point, most crowded first. */
export async function denseSpotsNear(tx: FirebaseFirestore.Transaction, lat: number, lng: number, radius: number, threshold: number) {
  return (await spotsNear(tx, lat, lng, radius)).filter(s => s.count >= threshold).sort((a, b) => b.count - a.count);
}

/**
 * Opens the dense spots around a fresh fix for 30 minutes. Clients send the best fix they have:
 * AR Geospatial (1-5 m outdoors) when the camera is localized, otherwise GPS.
 */
export const unlockDenseSpot = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 30 }, async request => {
  const caller = requireCaller(request), f = request.data?.location as Fix, now = Date.now();
  if (!f || !validCoordinates(f.lat, f.lng) || typeof f.accuracy !== 'number' || typeof f.measuredAt !== 'number') throw new HttpsError('invalid-argument', 'A location fix is required');
  if (!fixIsFresh(f, now)) return { unlocked: [], reason: 'stale_fix' };
  if (f.accuracy > MAX_ENTRY_ACCURACY_M) return { unlocked: [], reason: 'inaccurate_fix' };
  return await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const settings = await spotSettings(tx);
    const near = await denseSpotsNear(tx, f.lat, f.lng, settings.unlockRadius + UNLOCK_TOLERANCE_CAP_M, settings.denseThreshold);
    const opened = near.filter(s => fixUnlocksSpot(f, s, settings.unlockRadius)).map(s => s.id);
    for (const id of opened) tx.set(unlockRef(caller.luid, id), { owner_luid: caller.luid, spot: id, created_at: FieldValue.serverTimestamp(), expires_at: Timestamp.fromMillis(now + UNLOCK_TTL_MS) });
    return { unlocked: opened, reason: opened.length ? null : 'too_far', unlockRadius: settings.unlockRadius };
  });
});
