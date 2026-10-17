import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, Timestamp, requireCaller, HttpsError, ENFORCE_APP_CHECK, CALLABLE_MAX_INSTANCES, logger } from './core';
import { isPublicActive } from './counters';
import { autoApproveNote } from './noteAutomation';
import { repairSpotCount, syncSpotMembership } from './denseSpots';
import { refreshArea } from './campaignJourneys';
import { requireActiveAccount } from './profileGuard';
import { densityCells, densityQueryPrefixes, geohashBounds, validBox, validCoordinates, DENSITY_PRECISIONS } from './placeNoteRules';
import { MEMORY_LIMITS_ENABLED, WindowLimiter } from './memoryLimits';
import { reasonError } from './errors';

/** Map pans call readNoteDensity; this bounds a scripted client without writing a quota document. */
const densityLimiter = new WindowLimiter(60, 60_000);

/**
 * Map heat data: one server-only counter per geohash cell at precisions 4-7. Each post keeps a
 * member record of the cells it was counted in, so replays and out-of-order events converge on
 * the post's live state instead of double counting.
 */
const cellRef = (cell: string) => db.collection('note_density').doc(cell);
const memberRef = (postId: string) => db.collection('note_density_members').doc(postId);

export async function syncNoteDensity(postId: string) {
  await db.runTransaction(async tx => {
    const [post, member] = await tx.getAll(db.collection('posts').doc(postId), memberRef(postId));
    const data = post.data();
    const desired = data && isPublicActive(data) && validCoordinates(data.lat, data.lng) ? densityCells(data.lat, data.lng) : [];
    const previous: string[] = Array.isArray(member.get('cells')) ? member.get('cells') : [];
    if (desired.length === previous.length && desired.every(c => previous.includes(c))) return;
    for (const cell of previous.filter(c => !desired.includes(c))) {
      tx.set(cellRef(cell), { count: FieldValue.increment(-1), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    for (const cell of desired.filter(c => !previous.includes(c))) {
      const [precision, hash] = cell.split('_'), center = geohashBounds(hash);
      tx.set(cellRef(cell), { precision: Number(precision), cell: hash, lat: center.lat, lng: center.lng,
        count: FieldValue.increment(1), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (desired.length) tx.set(member.ref, { cells: desired, updated_at: FieldValue.serverTimestamp() });
    else tx.delete(member.ref);
  });
}

export const onPostDensityWritten = onDocumentWritten({ document: 'posts/{postId}', retry: true, maxInstances: 10 }, async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  const counted = (d: FirebaseFirestore.DocumentData | undefined) => d && isPublicActive(d) ? `${d.lat},${d.lng}` : null;
  if (counted(before) !== counted(after)) {
    await syncNoteDensity(event.params.postId);
    await syncSpotMembership(event.params.postId);
    // Old posts may predate the persistent member record. Recounting is redelivery-safe.
    if (typeof before?.spot_id === 'string') await repairSpotCount(before.spot_id);
  }
  // Phones nearby refresh their regions when a note starts notifying.
  if (after?.push_state === 'approved' && before?.push_state !== 'approved' && typeof after.lat === 'number') await refreshArea(after.lat, after.lng, 3_000);
  // Likes make a user location note notification-worthy without manual approval.
  if (after?.note_kind === 'location' && (after.push_state ?? 'none') === 'none' && Number(after.likes_count ?? 0) > Number(before?.likes_count ?? 0)) {
    await autoApproveNote(event.params.postId);
  }
});

/**
 * Self-healing pass over every post; also seeds counters for posts older than this feature. Triggers
 * keep counts current, so a daily pass of 500 posts is enough and keeps reads well inside the free
 * daily quota (an hourly pass alone could read more than 50,000 documents a day).
 */
export const reconcileNoteDensity = onSchedule({ schedule: 'every day 05:23', timeZone: 'Europe/Istanbul', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const state = db.collection('system').doc('note_density_reconcile');
  const cursor = (await state.get()).get('cursor');
  let query = db.collection('posts').orderBy('__name__').limit(500);
  if (typeof cursor === 'string' && cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const post of page.docs) { await syncNoteDensity(post.id); await syncSpotMembership(post.id); }
  const spotCursor = (await state.get()).get('spot_cursor');
  const base = db.collection('note_spots').orderBy('__name__');
  const spotPage = await (typeof spotCursor === 'string' ? base.startAfter(spotCursor) : base).limit(100).get();
  for (const spot of spotPage.docs) await repairSpotCount(spot.id);
  await state.set({ cursor: page.size === 500 ? page.docs.at(-1)!.id : null,
    spot_cursor: spotPage.size === 100 ? spotPage.docs.at(-1)!.id : null, updated_at: FieldValue.serverTimestamp() });
  logger.info('note density reconcile', { checked: page.size });
});

/**
 * Heat cells for the visible map box. Precision 4-6 draw the heat map, 7 the count bubbles.
 * Only non-empty cells are read through a bounded set of prefix range queries.
 */
export const readNoteDensity = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, timeoutSeconds: 30 }, async request => {
  const caller = requireCaller(request), b = request.data as Record<string, unknown>;
  const box = b?.box, precision = b?.precision;
  if (!validBox(box) || typeof precision !== 'number' || !(DENSITY_PRECISIONS as readonly number[]).includes(precision)) throw new HttpsError('invalid-argument', 'Invalid map area');
  if (MEMORY_LIMITS_ENABLED && !densityLimiter.allow(caller.luid)) throw reasonError('resource-exhausted', 'Too many map requests; try again shortly', 'rate_limited');
  await db.runTransaction(tx => requireActiveAccount(tx, caller.luid));
  const prefixes = densityQueryPrefixes(box, precision);
  const pages = await Promise.all(prefixes.map(prefix => db.collection('note_density').where('precision', '==', precision)
    .orderBy('cell').startAt(prefix).endAt(prefix + '\uf8ff').limit(500).get()));
  const cells = pages.flatMap(page => page.docs).map(d => d.data())
    .filter(c => {
      if (!(Number(c.count) > 0) || typeof c.cell !== 'string') return false;
      // Coarse cells are far larger than a zoomed-in box, so test overlap rather than the centre.
      const b = geohashBounds(c.cell);
      return b.latMax >= box.minLat && b.latMin <= box.maxLat && b.lngMax >= box.minLng && b.lngMin <= box.maxLng;
    })
    .map(c => ({ cell: String(c.cell), lat: Number(c.lat), lng: Number(c.lng), count: Number(c.count) }));
  return { precision, cells: cells.slice(0, 1500), truncated: cells.length > 1500 || pages.some(page => page.size === 500) };
});

/**
 * Notes never expire on their own. An administrator may set `ends_at`; this removes the note
 * like a moderator soft delete once that time passes.
 */
export async function expireDueNotes() {
  const due = await db.collection('posts').where('ends_at', '<=', Timestamp.now()).limit(200).get();
  for (const doc of due.docs) {
    await db.runTransaction(async tx => {
      const post = await tx.get(doc.ref), data = post.data();
      if (!data || !(data.ends_at instanceof Timestamp) || data.ends_at.toMillis() > Date.now()) return;
      // Clearing ends_at keeps already-handled posts out of the next due query.
      if (data.deleted_at || !['active', 'pending_review', 'flagged'].includes(data.status)) {
        tx.update(doc.ref, { ends_at: FieldValue.delete(), ended_at: data.ends_at });
        return;
      }
      tx.update(doc.ref, { status: 'removed', deleted_at: FieldValue.serverTimestamp(), deleted_by: 'system:scheduled_end',
        deletion_reason: 'scheduled_end', ends_at: FieldValue.delete(), ended_at: data.ends_at, updated_at: FieldValue.serverTimestamp() });
      if (typeof data.creator_id === 'string') tx.set(db.collection('storage_reclamations').doc(doc.id),
        { creator_id: data.creator_id, state: 'removed', public_readable: false }, { merge: true });
    });
  }
  return due.size;
}

export const expireScheduledNotes = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 300 }, async () => { await expireDueNotes(); });
