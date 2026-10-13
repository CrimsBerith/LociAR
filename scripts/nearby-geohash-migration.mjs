import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deploymentEnvironment } from './firebase-deploy.mjs';
const PROJECT = 'lociar-2f38c';
const require = createRequire(new URL('../functions/package.json', import.meta.url));

// Standalone migration: repository script tests run before Functions is built.
// Standard base32 encoding, matching functions/src/geo.ts and Geohash.swift.
function encodeGeohash(lat, lng) {
  const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, hash = '', bit = 0, ch = 0, even = true;
  while (hash.length < 10) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += alphabet[ch]; ch = 0; bit = 0; }
  }
  return hash;
}

export function desiredGeohash(post) {
  const { lat, lng } = post;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 || typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  return encodeGeohash(lat, lng);
}

async function scan(db, apply) {
  let cursor, examined = 0, mismatches = 0;
  for (let page = 0; page < 100; page++) {
    const base = db.collection('posts').orderBy('__name__');
    const docs = await (cursor ? base.startAfter(cursor) : base).limit(200).get();
    for (const doc of docs.docs) {
      examined++;
      const expected = desiredGeohash(doc.data());
      if (!expected || doc.get('geohash') === expected) continue;
      mismatches++;
      if (apply) await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return;
        const hash = desiredGeohash(current.data());
        if (hash && current.get('geohash') !== hash) tx.update(doc.ref, { geohash: hash });
      });
    }
    if (docs.size < 200) return { examined, mismatches, complete: true };
    cursor = docs.docs.at(-1);
  }
  throw new Error('Scan exceeded 20,000 documents; indexed queries remain disabled. Extend the migration before retrying.');
}

async function main(args) {
  const apply = args.includes('--apply');
  if (args.some(a => !['--apply', '--project', PROJECT].includes(a)) || args[args.indexOf('--project') + 1] !== PROJECT || !args.includes('--project')) throw new Error(`Usage: node scripts/nearby-geohash-migration.mjs --project ${PROJECT} [--apply]`);
  Object.assign(process.env, deploymentEnvironment(process.env));
  const { initializeApp } = require('firebase-admin/app'), { getFirestore, FieldValue } = require('firebase-admin/firestore');
  initializeApp({ projectId: PROJECT });
  const db = getFirestore(), marker = db.collection('system').doc('geo_queries');
  if (apply) await marker.set({ geohash_index_version: 0 }, { merge: true });
  const before = await scan(db, apply), after = apply ? await scan(db, false) : before;
  if (apply && after.complete && after.mismatches === 0) await marker.set({ geohash_index_version: 1, verified_at: FieldValue.serverTimestamp() }, { merge: true });
  if (apply && after.mismatches !== 0) throw new Error('Verification found mismatched coordinates; indexed queries remain disabled.');
  console.log(JSON.stringify({ apply, before, after, enabled: apply && after.complete && after.mismatches === 0 }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
