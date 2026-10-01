// One-off: trims profiles.display_name longer than 60 characters (server limit is 60).
// Usage: FIREBASE_PROJECT_ID=lociar-2f38c node scripts/fix-long-display-names.mjs [--apply]
import { db } from './_admin.mjs';

const apply = process.argv.includes('--apply');
let fixed = 0;
let last;
for (;;) {
  let q = db.collection('profiles').orderBy('__name__').limit(400);
  if (last) q = q.startAfter(last);
  const page = await q.get();
  if (page.empty) break;
  for (const d of page.docs) {
    const name = d.get('display_name');
    if (typeof name === 'string' && name.length > 60) {
      fixed++;
      console.log(`${d.id}: ${name.length} -> 60`);
      if (apply) await d.ref.update({ display_name: name.trim().slice(0, 60) });
    }
  }
  last = page.docs[page.size - 1];
}
console.log(`${apply ? 'Fixed' : 'Would fix'} ${fixed} profile(s).`);
process.exit(0);
