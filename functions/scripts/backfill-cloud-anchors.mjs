// One-off migration for posts created before cloud_anchors ownership records existed:
//  1. finds the Cloud Anchor id of older posts that carry it only inside pose/anchor_bundle JSON,
//  2. writes cloud_anchors/{id} = { owner_luid, post_id } so delete paths and the orphan scan
//     recognise those anchors (without a record they are neither deleted nor protected).
// Usage: FIREBASE_PROJECT_ID=lociar-2f38c node scripts/backfill-cloud-anchors.mjs [--apply]
import { db } from './_admin.mjs';

const apply = process.argv.includes('--apply');
const ID = /^[A-Za-z0-9_-]{8,128}$/;

function anchorIdFromJson(raw) {
  try {
    const json = JSON.parse(raw ?? 'null');
    return json?.anchor?.persistence?.cloudAnchorId ?? json?.persistence?.cloudAnchorId ?? null;
  } catch { return null; }
}

let scanned = 0, linked = 0, recovered = 0;
let last;
for (;;) {
  let q = db.collection('posts').orderBy('__name__').limit(400);
  if (last) q = q.startAfter(last);
  const page = await q.get();
  if (page.empty) break;
  for (const d of page.docs) {
    scanned++;
    const data = d.data();
    let id = data.cloud_anchor_id;
    if (!id) {
      id = anchorIdFromJson(data.pose_json) ?? anchorIdFromJson(data.anchor_bundle_json);
      if (id && ID.test(id)) {
        recovered++;
        if (apply) await d.ref.update({ cloud_anchor_id: id });
      } else continue;
    }
    const record = await db.collection('cloud_anchors').doc(id).get();
    if (record.exists) continue;
    linked++;
    console.log(`${d.id} -> ${id}`);
    if (apply) await db.collection('cloud_anchors').doc(id).create({ owner_luid: data.creator_id, post_id: d.id, backfilled: true });
  }
  last = page.docs[page.size - 1];
}
console.log(`${apply ? 'Applied' : 'Dry run'}: scanned ${scanned}, recovered ids ${recovered}, records ${linked}.`);
process.exit(0);
