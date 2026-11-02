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
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { activeDensityPost, seedDensityConflicts, SEED_GROUP_M } from './seed-density.mjs';
import { renderedTextMatches } from './launch-review.mjs';

const { values: opts } = parseArgs({
  options: {
    seed: { type: 'string' }, actor: { type: 'string' }, author: { type: 'string' }, reason: { type: 'string' },
    only: { type: 'string' }, apply: { type: 'boolean', default: false }, retire: { type: 'boolean', default: false },
    'allow-approx': { type: 'boolean', default: false },
    'require-complete': { type: 'boolean', default: false },
    report: { type: 'string' },
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
const MAX_SEED_TEXT_CHARS = 140, WRITE_GAP_MS = 120, READ_CHUNK = 100, LIVE_DENSITY_CAP = 5000;

/** Ordered work, one item at a time (as in functions/src/async.ts): every write is its own audited
 *  transaction, and the density checks of the next write must see the previous one. */
function forEachSequential(items, visit) {
  return items.reduce((previous, item) => previous.then(() => visit(item)), Promise.resolve());
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function authorId(item) {
  if (opts.author) return opts.author.toLowerCase();
  const handle = String(item.author_handle ?? seed.author_handle ?? '');
  if (!/^[a-z0-9_.]{3,30}$/.test(handle)) throw new Error('Invalid seed author handle.');
  const reservation = await db.collection('handles').doc(handle).get();
  if (!reservation.exists) return null;
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
if (opts.author && items.some(item => item.author_handle)) throw new Error('--author cannot override per-note identity assignments.');
if (opts.apply && items.some(item => item.author_handle) && !opts['require-complete']) throw new Error('Per-note identity plans require --require-complete. Nothing was written.');
const authors = new Map();
for (const item of items) {
  if (Object.hasOwn(item,'author_handle') && (typeof item.author_handle !== 'string' || !/^[a-z0-9_.]{3,30}$/.test(item.author_handle))) throw new Error('Invalid per-note identity assignment. Nothing was written.');
  const handle = opts.author ?? item.author_handle ?? seed.author_handle;
  if (authors.has(handle)) continue;
  const author = await authorId(item);
  if (!author) { authors.set(handle,null); continue; }
  const profile = await db.collection('profiles').doc(author).get();
  if (!profile.exists || profile.get('deleted_at') || profile.get('suspended')) throw new Error('The seed author is missing, deleted or suspended.');
  if (profile.get('admin_managed') !== true) throw new Error('The launch seed author must be a managed content user.');
  authors.set(handle, author);
}

const zones = (await db.collection('protected_zones').where('active', '==', true).get()).docs
  .filter(z => z.get('policy') === 'hard_block')
  .map(z => ({ name: String(z.get('name') ?? z.id), lat: Number(z.get('lat')), lng: Number(z.get('lng')), radius: Number(z.get('radius_meters')) }));

function checkItem(item) {
  const row = { item, problems: [], key: derivedKey(`${seed.batch}:${item.id}`, 'seed') };
  const author = authors.get(opts.author ?? item.author_handle ?? seed.author_handle);
  if (!author) row.problems.push(`Create the content user @${item.author_handle ?? seed.author_handle} first; identity is not provisioned.`);
  if (typeof item.text !== 'string' || item.text.length > MAX_SEED_TEXT_CHARS) {
    row.problems.push(`invalid: seed text must be at most ${MAX_SEED_TEXT_CHARS} characters`);
  }
  try { if (author) {
    row.input = parseContentInput({
      authorId: author, caption: item.text, text: item.text, lat: item.lat, lng: item.lng,
      authorAttribution: Object.hasOwn(item,'author_attribution') ? item.author_attribution : Object.hasOwn(seed,'author_attribution') ? seed.author_attribution : 'named',
      status: 'active', visibility: 'public', ageRating: 'all',
      locationNote: item.kind === 'note', notifyRadius: item.radius_m ?? 25,
      approveNotifications: item.kind === 'note' && item.notify === true,
      // AR bubbles a little larger than the panel default, so they read from a few metres away.
      ...(item.kind === 'ar' ? { width: 1.2, height: 0.8 } : {}),
      seedBatch: seed.batch,
    }); }
  } catch (error) { row.problems.push(`invalid: ${error.message}`); }
  const zone = zones.find(z => distanceMeters(item.lat, item.lng, z.lat, z.lng) <= z.radius);
  if (zone) row.problems.push(`protected zone: ${zone.name}`);
  row.fieldHold = item.placement_requirement === 'field_cloud_anchor';
  row.editorialHold = Boolean(item.persona_id && item.persona_status !== 'reviewed') || item.upload_hold === true;
  row.identityHold = Boolean(item.persona_id && !item.author_handle && !opts.author);
  row.held = row.fieldHold || row.editorialHold || row.identityHold || (item.coord === 'approx' && !opts['allow-approx']);
  return row;
}
const rows = items.map(checkItem);
// Already loaded: post ids derive from the item keys, read in a few batched calls.
const refs = rows.map(row => db.collection('posts').doc(derivedKey(row.key, 'post')));
const parts = Array.from({ length: Math.ceil(refs.length / READ_CHUNK) }, (_, i) => refs.slice(i * READ_CHUNK, (i + 1) * READ_CHUNK));
const snapshots = (await Promise.all(parts.map(part => db.getAll(...part)))).flat();
rows.forEach((row, i) => {
  const stored=snapshots[i];row.loaded=stored.exists;
  if (!stored.exists) return;
  row.loadedMismatch = !row.input || stored.get('caption') !== row.item.text || !renderedTextMatches(stored.data(),row.item.text) || stored.get('status') !== 'active'
    || stored.get('visibility') !== 'public' || Boolean(stored.get('deleted_at'))
    || Boolean(row.input && (stored.get('creator_id') !== row.input.authorId
      || (stored.get('is_anonymous') === true) !== (row.input.authorAttribution === 'anonymous')));
  if (row.loadedMismatch) row.problems.push('existing post differs from this selection; use an audited existing-ID edit, never a new seed ID');
});

// This is an owner-run import preflight, not a map request. Bound the one-time
// global read; refuse larger pools rather than silently checking a partial one.
const live = await db.collection('posts').where('status', '==', 'active').where('visibility','==','public').limit(LIVE_DENSITY_CAP + 1)
  .select('lat','lng','visibility','deleted_at','ends_at').get();
if (live.size > LIVE_DENSITY_CAP) throw new Error('Live density pool exceeds the bounded preflight; prepare a scoped geographic audit before importing. Nothing was written.');
const livePoints = live.docs.filter(doc => activeDensityPost(doc.data())).map(doc => ({id:doc.id,lat:doc.get('lat'),lng:doc.get('lng')}));
if (livePoints.some(point => !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180)) throw new Error('Invalid live coordinates; density preflight is incomplete. Nothing was written.');
const density = seedDensityConflicts(rows.map(row => ({id:derivedKey(row.key,'post'),lat:row.item.lat,lng:row.item.lng,loaded:row.loaded})), livePoints, distanceMeters);
for (const row of rows) {
  const count = density.get(derivedKey(row.key,'post'));
  if (count) row.problems.push(`${count} combined live/selected posts within ${SEED_GROUP_M} m`);
}

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
const reviewHeld = rows.filter(row => (row.editorialHold || row.identityHold) && !row.problems.length).length;
const report = {
  batch: seed.batch, apply_requested: opts.apply, checked_at: new Date().toISOString(),
  total: rows.length, already_loaded: rows.filter(row => row.loaded).length,
  blocked, held, complete: rows.every(row => !row.problems.length && !row.held),
  rows: rows.map(row => ({ id: row.item.id, post_id: derivedKey(row.key, 'post'),
    loaded: row.loaded, held: row.held, problems: row.problems })),
};
const saveReport = () => { if (opts.report) writeFileSync(opts.report, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); };
saveReport();
const holdReason = reviewHeld ? 'coordinate, editorial or identity review' : fieldHeld ? 'coordinate or field placement review' : 'an approximate anchor';
console.log(`\n${rows.length} items: ${rows.filter(r => r.loaded).length} already loaded, ${blocked} with problems, ${held} held for ${holdReason}.`);
if (held > fieldHeld) console.log('Check the approximate anchors on the admin map, then pass --allow-approx.');
if (fieldHeld) console.log(`${fieldHeld} AR drafts require an on-site Cloud Anchor; --allow-approx cannot release them. Publish these with the native field workflow.`);
if (reviewHeld) console.log(`${reviewHeld} drafts need completed editorial and per-note identity review; --allow-approx cannot release them.`);

const incomplete = rows.filter(row => !row.loaded && (row.problems.length || row.held));
const existingMismatch = rows.filter(row => row.loadedMismatch);
if (opts['require-complete'] && existingMismatch.length) {
  console.error(`Existing content mismatch: ${existingMismatch.length} selected posts need an audited edit. Nothing was written.`);
  process.exit(1);
}
if (opts['require-complete'] && incomplete.length) {
  console.error(`Incomplete selection: ${incomplete.length} unloaded items are blocked or held. Nothing was written.`);
  process.exit(1);
}

if (!opts.apply) {
  console.log('Dry run: nothing was written. Add --apply to load the items without problems.');
  process.exit(blocked ? 1 : 0);
}

let created = 0, failed = 0;
report.apply_results = [];
const pending = rows.filter(row => !row.loaded && !row.problems.length && !row.held);
await forEachSequential(pending, async row => {
  try {
    await saveAdminPost(row.input, opts.actor, reason, row.key);
    created++;
    report.apply_results.push({ id: row.item.id, post_id: derivedKey(row.key, 'post'), status: 'saved' });
  } catch (error) {
    failed++;
    report.apply_results.push({ id: row.item.id, post_id: derivedKey(row.key, 'post'), status: 'failed', error: error.message });
    console.error(`  x ${row.item.id}: ${error.message}`);
  }
  report.saved = created;
  report.failed = failed;
  report.apply_complete = failed === 0 && created === pending.length && blocked === 0 && held === 0;
  saveReport();
  await pause(WRITE_GAP_MS);
});
report.saved = created;
report.failed = failed;
report.apply_complete = failed === 0 && created === pending.length && blocked === 0 && held === 0;
saveReport();
const failures = failed ? `, ${failed} failed` : '';
console.log(`Loaded ${created} items${failures}.`);
process.exit(failed ? 1 : 0);
