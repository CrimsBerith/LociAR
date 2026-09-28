// Imports protected zones (schools, hospitals, places of worship...) that createPost hard-blocks.
// Usage: FIREBASE_PROJECT_ID=my-project node scripts/import-protected-zones.mjs zones.json
// zones.json: [{ "name": "...", "category": "school", "lat": 41.0, "lng": 29.0, "radius_meters": 150 }]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './_admin.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-protected-zones.mjs <zones.json>');
  process.exit(1);
}
const zones = JSON.parse(readFileSync(file, 'utf8'));
const writer = db.bulkWriter();
let count = 0;
for (const zone of zones) {
  if (typeof zone.lat !== 'number' || typeof zone.lng !== 'number' || !zone.name) continue;
  const id = createHash('sha1').update(`${zone.name}|${zone.lat.toFixed(6)}|${zone.lng.toFixed(6)}`).digest('hex').slice(0, 24);
  writer.set(db.collection('protected_zones').doc(id), {
    name: String(zone.name),
    category: String(zone.category ?? 'other'),
    policy: String(zone.policy ?? 'hard_block'),
    lat: zone.lat,
    lng: zone.lng,
    radius_meters: Number(zone.radius_meters ?? 150),
    active: zone.active !== false,
    created_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  count++;
}
await writer.close();
console.log(`Imported ${count} protected zones.`);
