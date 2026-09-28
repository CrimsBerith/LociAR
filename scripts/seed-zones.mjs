import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

const cfg = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8'));
const token = cfg.tokens.access_token;
const projectId = 'lociar-2f38c';

const zones = JSON.parse(fs.readFileSync('./functions/scripts/zones.json', 'utf8'));

console.log(`Seeding ${zones.length} protected zones into Firestore (${projectId})...`);

for (const zone of zones) {
  const docId = crypto.createHash('sha1').update(`${zone.name}|${zone.lat.toFixed(6)}|${zone.lng.toFixed(6)}`).digest('hex').slice(0, 24);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/protected_zones/${docId}`;

  const body = {
    fields: {
      name: { stringValue: zone.name },
      category: { stringValue: zone.category || 'other' },
      policy: { stringValue: zone.policy || 'hard_block' },
      lat: { doubleValue: zone.lat },
      lng: { doubleValue: zone.lng },
      radius_meters: { integerValue: zone.radius_meters || 150 },
      active: { booleanValue: true },
      created_at: { timestampValue: new Date().toISOString() }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    console.log(`✔ Seeded: ${zone.name} (${docId})`);
  } else {
    const err = await res.text();
    console.error(`✖ Failed to seed ${zone.name}:`, err);
  }
}

console.log('Seeding complete!');
