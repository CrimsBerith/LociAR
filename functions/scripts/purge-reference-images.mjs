// One-off cleanup: camera reference frames are no longer collected (29 Sep 2026).
// Lists every object under post-reference-images/ and deletes them with --apply.
// Usage: FIREBASE_PROJECT_ID=lociar-2f38c node scripts/purge-reference-images.mjs [--apply]
import { getStorage } from 'firebase-admin/storage';
import './_admin.mjs';

const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`);
const [files] = await bucket.getFiles({ prefix: 'post-reference-images/' });
const bytes = files.reduce((sum, f) => sum + Number(f.metadata.size ?? 0), 0);
console.log(`${files.length} reference image(s), ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (!apply) {
  console.log('Dry run. Re-run with --apply to delete.');
  process.exit(0);
}
await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
console.log('Deleted.');
