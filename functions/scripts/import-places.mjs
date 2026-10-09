// Imports curated landmarks ("mekan katmanı"). createPost stores `place_id` on posts inside a place's radius.
// Usage: FIREBASE_PROJECT_ID=my-project node scripts/import-places.mjs places.json [--apply]
// places.json: [{ "name": "Galata Kulesi", "city": "istanbul", "lat": 41.0256, "lng": 28.9742, "radius_meters": 120 }]
// Without --apply it only validates and reports. A place that overlaps a protected zone is refused:
// createPost hard-blocks posting there, so listing it would promise something users cannot do.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './_admin.mjs';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/import-places.mjs <places.json> [--apply]');
  process.exit(1);
}

const toRad = (d) => (d * Math.PI) / 180;
const meters = (a, b) => {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const zones = (await db.collection('protected_zones').where('active', '==', true).get()).docs.map((d) => d.data());
const places = JSON.parse(readFileSync(file, 'utf8'));
const writer = db.bulkWriter();
let imported = 0;
let refused = 0;
for (const place of places) {
  const valid = place && typeof place.name === 'string' && place.name
    && Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && Number(place.radius_meters ?? 100) >= 20 && Number(place.radius_meters ?? 100) <= 500;
  if (!valid) { console.warn(`Skipped (invalid): ${JSON.stringify(place)}`); refused++; continue; }
  const radius = Number(place.radius_meters ?? 100);
  const clash = zones.find((z) => meters(place, z) <= radius + Number(z.radius_meters ?? 0));
  if (clash) { console.warn(`Refused (overlaps protected zone "${clash.name}"): ${place.name}`); refused++; continue; }
  const id = createHash('sha1').update(`${place.name}|${place.lat.toFixed(6)}|${place.lng.toFixed(6)}`).digest('hex').slice(0, 24);
  if (apply) {
    writer.set(db.collection('places').doc(id), {
      name: place.name,
      city: String(place.city ?? '').toLowerCase(),
      lat: place.lat,
      lng: place.lng,
      radius_meters: radius,
      active: place.active !== false,
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  imported++;
}
await writer.close();
console.log(`${apply ? 'Imported' : 'Would import'} ${imported} places; ${refused} refused or skipped.`);
