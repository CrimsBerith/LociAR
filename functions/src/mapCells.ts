import { db, FieldValue } from './core';
import { isPublicActive } from './counters';
import { circleBox, distanceMeters, encodeGeohash, geohashGrid } from './geo';
import { validCoordinates } from './placeNoteRules';

/**
 * Map cell index: one server-only document per ~1.2 km × 0.6 km geohash-6 cell holding the position of
 * every public post in it (`map_cells/{cell}.posts.{postId} = [lat, lng, creatorId, anonymous, spotId]`).
 * A map view reads the few cells it covers instead of scanning every post of a 5–40 km geohash range,
 * so its cost no longer grows with how many posts the city has. Bodies are read only for the rows a
 * reply returns. The trigger keeps cells current (onPostDensityWritten → syncMapCell); the nightly
 * `map_cells` maintenance task repairs drift and, after its first full post/member passes, switches readers on
 * (`system/geo_queries.map_cells_version = 1`). Clients can never read these collections.
 */
export const MAP_CELL_PRECISION = 6;
/** Larger areas keep the bounded range scan; the app asks for at most 2 km (map groups). */
export const MAP_CELL_MAX_RADIUS_M = 2_000;
/** Entries per cell document (about 200 bytes each, far below the 1 MiB document limit). */
export const MAP_CELL_CAPACITY = 2_500;
const MAX_CELLS_PER_READ = 64;

export type MapCellEntry = [lat: number, lng: number, creatorId: string, anonymous: 0 | 1, spotId: string];
export type MapCandidate = { id: string; lat: number; lng: number; creatorId: string; anonymous: boolean; spotId: string | null };

const cellRef = (cell: string) => db.collection('map_cells').doc(cell);
const memberRef = (postId: string) => db.collection('map_cell_members').doc(postId);

/** The cell and entry a post should have, or null when it is not public, active and placed. */
export function mapCellPlacement(post: FirebaseFirestore.DocumentData | undefined): { cell: string; entry: MapCellEntry } | null {
  if (!post || !isPublicActive(post) || !validCoordinates(post.lat, post.lng) || typeof post.creator_id !== 'string') return null;
  return { cell: encodeGeohash(post.lat, post.lng, MAP_CELL_PRECISION),
    entry: [post.lat, post.lng, post.creator_id, post.is_anonymous === true ? 1 : 0, typeof post.spot_id === 'string' ? post.spot_id : ''] };
}

/** True when a write changes what the index holds for the post. */
export function mapCellChanged(before: FirebaseFirestore.DocumentData | undefined, after: FirebaseFirestore.DocumentData | undefined) {
  return JSON.stringify(mapCellPlacement(before)) !== JSON.stringify(mapCellPlacement(after));
}

/**
 * Brings one post's index entry in line with the live post. Reads the post and its member record in a
 * transaction, so redelivered or reordered events converge instead of double counting.
 */
export async function syncMapCell(postId: string): Promise<void> {
  await db.runTransaction(async tx => {
    const [post, member] = await tx.getAll(db.collection('posts').doc(postId), memberRef(postId));
    const desired = mapCellPlacement(post.data());
    const previousCell = typeof member.get('cell') === 'string' ? member.get('cell') as string : null;
    const previousOverflow = member.get('overflow') === true;
    const moving = previousCell !== (desired?.cell ?? null);
    if (!moving && JSON.stringify(member.get('entry') ?? null) === JSON.stringify(desired?.entry ?? null)) return;
    // Reads come first in a transaction: the target cell's size decides whether there is still room.
    const target = desired && (moving || previousOverflow) ? await tx.get(cellRef(desired.cell)) : null;
    if (previousCell && moving && !previousOverflow) {
      tx.set(cellRef(previousCell), { posts: { [postId]: FieldValue.delete() }, count: FieldValue.increment(-1), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (!desired) { tx.delete(member.ref); return; }
    const full = target ? Number(target.get('count') ?? 0) >= MAP_CELL_CAPACITY : previousOverflow;
    if (full) {
      // Readers scan an overflowing cell's posts directly, so its notes still appear.
      tx.set(cellRef(desired.cell), { cell: desired.cell, overflow: true, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      tx.set(cellRef(desired.cell), { cell: desired.cell, posts: { [postId]: desired.entry },
        ...(target ? { count: FieldValue.increment(1) } : {}), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(member.ref, { cell: desired.cell, entry: desired.entry, overflow: full, updated_at: FieldValue.serverTimestamp() });
  });
}

const CELL_STATE = () => db.collection('system').doc('map_cells_reconcile');
const GEO_FLAGS = () => db.collection('system').doc('geo_queries');

/**
 * Nightly repair (maintenance task `map_cells`): walks posts and members with separate cursors,
 * at most 1,000 of each per run. Readers switch on after both scans have completed a full pass.
 */
export async function reconcileMapCells(pageSize = 1_000) {
  const state = await CELL_STATE().get();
  const cursor = state.get('cursor');
  let query = db.collection('posts').orderBy('__name__').select().limit(pageSize);
  if (typeof cursor === 'string' && cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const post of page.docs) await syncMapCell(post.id); // sequential: each is its own transaction
  const finished = page.size < pageSize;
  // Deleted posts no longer occur in the post scan. Walk persistent members too,
  // so a missed deletion event cannot leave a permanent locator/count behind.
  let membersQuery = db.collection('map_cell_members').orderBy('__name__').select().limit(pageSize);
  const memberCursor = state.get('member_cursor');
  if (typeof memberCursor === 'string' && memberCursor) membersQuery = membersQuery.startAfter(memberCursor);
  const members = await membersQuery.get();
  for (const member of members.docs) await syncMapCell(member.id);
  const membersFinished = members.size < pageSize;
  await CELL_STATE().set({ cursor: finished ? null : page.docs.at(-1)!.id, updated_at: FieldValue.serverTimestamp(),
    member_cursor: membersFinished ? null : members.docs.at(-1)!.id,
    ...(finished ? { last_full_pass_at: FieldValue.serverTimestamp() } : {}),
    ...(membersFinished ? { last_member_pass_at: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  if ((finished || state.get('last_full_pass_at')) && (membersFinished || state.get('last_member_pass_at'))
    && (await GEO_FLAGS().get()).get('map_cells_version') !== 1) {
    await GEO_FLAGS().set({ map_cells_version: 1, map_cells_enabled_at: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { checked: page.size, finished: finished ? 1 : 0, membersChecked: members.size };
}

let flagCache: { enabled: boolean; until: number } | null = null;
/** Whether readers may use the index; cached for a minute per instance (one read instead of one per request). */
export async function mapCellsEnabled(now = Date.now()): Promise<boolean> {
  if (flagCache && flagCache.until > now) return flagCache.enabled;
  const enabled = (await GEO_FLAGS().get()).get('map_cells_version') === 1;
  flagCache = { enabled, until: now + (process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : 60_000) };
  return enabled;
}

/**
 * Index candidates within the circle: public, active posts with their author for the caller's block and
 * account checks. Overflowing cells are listed so the caller can scan them. Returns null when the area is
 * too large for the index.
 */
export async function mapCellCandidates(lat: number, lng: number, radius: number) {
  if (radius > MAP_CELL_MAX_RADIUS_M) return null;
  const box = circleBox(lat, lng, radius);
  const cells = box && geohashGrid(box, MAP_CELL_PRECISION, MAX_CELLS_PER_READ);
  if (!cells) return null;
  const snapshots = await db.getAll(...cells.map(cellRef));
  const candidates: MapCandidate[] = [], overflow: string[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    if (snapshot.get('overflow') === true) overflow.push(snapshot.id);
    const posts = snapshot.get('posts') as Record<string, unknown> | undefined;
    for (const [id, value] of Object.entries(posts ?? {})) {
      if (!Array.isArray(value) || value.length < 5) continue;
      const [pLat, pLng, creatorId, anonymous, spotId] = value as MapCellEntry;
      if (!validCoordinates(pLat, pLng) || typeof creatorId !== 'string' || distanceMeters(lat, lng, pLat, pLng) > radius) continue;
      candidates.push({ id, lat: pLat, lng: pLng, creatorId, anonymous: anonymous === 1, spotId: spotId || null });
    }
  }
  return { candidates, overflow };
}

export const _test = { resetFlagCache: () => { flagCache = null; } };
