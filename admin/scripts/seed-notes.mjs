#!/usr/bin/env node
/**
 * Owner-run launch seed importer (docs/release/LAUNCH_SEED.md). It loads location notes and
 * approximate AR posts from a seed file in scripts/seed/ through the same audited path as
 * Posts -> Create (`saveAdminPost`): text and link checks, permissions, protected zones and one audit
 * receipt per item. Keys derive from the batch and item id, so a rerun skips what is already loaded.
 *
 * Dry run by default (reads only). --apply writes. --retire gives every post of the batch an end
 * date five minutes out; the scheduled job then removes them.
 *
 *   cd admin
 *   GOOGLE_CLOUD_PROJECT=lociar-2f38c node --conditions=react-server --import ./tests/register-typescript.mjs \
 *     scripts/seed-notes.mjs --seed world-capitals --actor <admin uid> [--apply] [--allow-approx]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    seed: { type: 'string' }, actor: { type: 'string' }, author: { type: 'string' }, reason: { type: 'string' },
    only: { type: 'string' }, apply: { type: 'boolean', default: false }, retire: { type: 'boolean', default: false },
    'allow-approx': { type: 'boolean', default: false },
  },
});

// --seed names a file in scripts/seed/. The path comes from that directory's listing, never from the
// argument itself, so the importer cannot be pointed at any other file.
const SEED_DIR = fileURLToPath(new URL('../../scripts/seed/', import.meta.url));
const seedFiles = readdirSync(SEED_DIR).filter(name => name.endsWith('.json')).sort();
const seedFile = seedFiles.find(name => name === `${opts.seed}.json`);
if (!seedFile || !opts.actor || (opts.apply && opts.retire)) {
  console.error('Usage: seed-notes.mjs --seed <name> --actor <admin uid> [--author <luid>] [--only city,city] [--apply [--allow-approx] | --retire]');
  console.error(`Seeds in scripts/seed/: ${seedFiles.map(name => name.replace(/\.json$/, '')).join(', ')}`);
  process.exit(2);
}

const seed = JSON.parse(readFileSync(join(SEED_DIR, seedFile), 'utf8'));
if (!/^[a-z0-9-]{3,48}$/.test(String(seed.batch ?? '')) || !Array.isArray(seed.items)) throw new Error(`${seedFile} needs a batch id and items`);
const { parseContentInput, saveAdminPost } = await import('../lib/content-ops.ts');
const { operatePlaceNote } = await import('../lib/place-notes.ts');
const { adminDb } = await import('../lib/firebase-admin.ts');
const { derivedKey } = await import('../lib/ops.ts');
const { distanceMeters } = await import('../lib/geo.ts');

const db = adminDb();
const reason = opts.reason ?? `Launch seed ${seed.batch}`;
const SEED_GROUP_M = 25, MAX_SEEDS_PER_GROUP = 3, WRITE_GAP_MS = 120, READ_CHUNK = 100;

/** Ordered work, one item at a time (as in functions/src/async.ts): every write is its own audited
 *  transaction, and the density checks of the next write must see the previous one. */
function forEachSequential(items, visit) {
  return items.reduce((previous, item) => previous.then(() => visit(item)), Promise.resolve());
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function authorId() {
  if (opts.author) return opts.author.toLowerCase();
  const handle = String(seed.author_handle ?? '');
  const reservation = await db.collection('handles').doc(handle).get();
  if (!reservation.exists) throw new Error(`Create the content user @${handle} first (Users -> Create content user).`);
  return String(reservation.get('luid'));
}

if (opts.retire) {
  const posts = await db.collection('posts').where('seed_batch', '==', seed.batch).get();
  const live = posts.docs.filter(d => !d.get('deleted_at') && d.get('status') !== 'removed');
  const endsAt = new Date(Date.now() + 5 * 60_000).toISOString();
  // One receipt per post and run: a later retire run may bring an end date forward again.
  await forEachSequential(live, post => operatePlaceNote({ id: post.id, action: 'set_end', endsAt }, opts.actor, reason,
    derivedKey(`${seed.batch}:${post.id}:${endsAt}`, 'retire')));
  console.log(`${live.length} posts from ${seedFile} end at ${endsAt}; the scheduled job removes up to 200 every 15 minutes.`);
  process.exit(0);
}

const only = opts.only ? new Set(opts.only.split(',').map(s => s.trim()).filter(Boolean)) : null;
const items = seed.items.filter(i => !only || only.has(i.id) || only.has(i.area_id) || only.has(i.id.replace(/-(ar|b?\d+)$/, '')));
if (!items.length) {
  console.error(`No item of ${seedFile} matches --only.`);
  process.exit(2);
}
const author = await authorId();
const profile = await db.collection('profiles').doc(author).get();
if (!profile.exists || profile.get('deleted_at') || profile.get('suspended')) throw new Error('The seed author is missing, deleted or suspended.');
if (profile.get('admin_managed') !== true) console.warn('Warning: the seed author is not a managed content user.');

const zones = (await db.collection('protected_zones').where('active', '==', true).get()).docs
  .filter(z => z.get('policy') === 'hard_block')
  .map(z => ({ name: String(z.get('name') ?? z.id), lat: Number(z.get('lat')), lng: Number(z.get('lng')), radius: Number(z.get('radius_meters')) }));

function checkItem(item) {
  const row = { item, problems: [], key: derivedKey(`${seed.batch}:${item.id}`, 'seed') };
  try {
    row.input = parseContentInput({
      authorId: author, caption: item.text, text: item.text, lat: item.lat, lng: item.lng,
      status: 'active', visibility: 'public', ageRating: 'all',
      locationNote: item.kind === 'note', notifyRadius: item.radius_m ?? 25,
      approveNotifications: item.kind === 'note' && item.notify === true,
      // AR bubbles a little larger than the panel default, so they read from a few metres away.
      ...(item.kind === 'ar' ? { width: 1.2, height: 0.8 } : {}),
      seedBatch: seed.batch,
    });
  } catch (error) { row.problems.push(`invalid: ${error.message}`); }
  const zone = zones.find(z => distanceMeters(item.lat, item.lng, z.lat, z.lng) <= z.radius);
  if (zone) row.problems.push(`protected zone: ${zone.name}`);
  const crowd = items.filter(o => o !== item && distanceMeters(item.lat, item.lng, o.lat, o.lng) <= SEED_GROUP_M).length;
  if (crowd >= MAX_SEEDS_PER_GROUP) row.problems.push(`${crowd + 1} seeds within ${SEED_GROUP_M} m`);
  row.fieldHold = item.placement_requirement === 'field_cloud_anchor';
  row.held = row.fieldHold || (item.coord === 'approx' && !opts['allow-approx']);
  return row;
}
const rows = items.map(checkItem);
// Already loaded: post ids derive from the item keys, read in a few batched calls.
const refs = rows.map(row => db.collection('posts').doc(derivedKey(row.key, 'post')));
const parts = Array.from({ length: Math.ceil(refs.length / READ_CHUNK) }, (_, i) => refs.slice(i * READ_CHUNK, (i + 1) * READ_CHUNK));
const snapshots = (await Promise.all(parts.map(part => db.getAll(...part)))).flat();
rows.forEach((row, i) => { row.loaded = snapshots[i].exists; });

const byCity = new Map();
for (const row of rows) {
  const c = byCity.get(row.item.city) ?? { notes: 0, ar: 0, loaded: 0, problems: [], held: 0 };
  c[row.item.kind === 'ar' ? 'ar' : 'notes']++;
  if (row.loaded) c.loaded++;
  if (row.held) c.held++;
  c.problems.push(...row.problems.map(p => `${row.item.id}: ${p}`));
  byCity.set(row.item.city, c);
}
for (const [city, c] of byCity) {
  const flags = [c.loaded ? `${c.loaded} loaded` : '', c.held ? `${c.held} held (approx)` : ''].filter(Boolean).join(', ');
  console.log(`${city.padEnd(18)} ${String(c.notes).padStart(2)} notes  ${c.ar} AR  ${flags}`);
  for (const p of c.problems) console.log(`    ! ${p}`);
}
const blocked = rows.filter(r => r.problems.length).length;
const held = rows.filter(r => r.held && !r.problems.length).length;
const fieldHeld = rows.filter(row => row.fieldHold && !row.problems.length).length;
const holdReason = fieldHeld ? 'coordinate or field placement review' : 'an approximate anchor';
console.log(`\n${rows.length} items: ${rows.filter(r => r.loaded).length} already loaded, ${blocked} with problems, ${held} held for ${holdReason}.`);
if (held > fieldHeld) console.log('Check the approximate anchors on the admin map, then pass --allow-approx.');
if (fieldHeld) console.log(`${fieldHeld} AR drafts require an on-site Cloud Anchor; --allow-approx cannot release them. Publish these with the native field workflow.`);

if (!opts.apply) {
  console.log('Dry run: nothing was written. Add --apply to load the items without problems.');
  process.exit(blocked ? 1 : 0);
}

let created = 0, failed = 0;
const pending = rows.filter(row => !row.loaded && !row.problems.length && !row.held);
await forEachSequential(pending, async row => {
  try {
    await saveAdminPost(row.input, opts.actor, reason, row.key);
    created++;
  } catch (error) {
    failed++;
    console.error(`  x ${row.item.id}: ${error.message}`);
  }
  await pause(WRITE_GAP_MS);
});
const failures = failed ? `, ${failed} failed` : '';
console.log(`Loaded ${created} items${failures}.`);
process.exit(failed ? 1 : 0);
