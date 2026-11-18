import { forEachSequential, readPages } from './async.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deploymentEnvironment } from './firebase-deploy.mjs';
const PROJECT = 'lociar-2f38c';
const require = createRequire(new URL('../functions/package.json', import.meta.url));

/**
 * Post reports filed before 10 Nov 2026 have a moderation flag but no report_receipts document.
 * Functions read receipts (one batched read) only after this backfill sets
 * `system/report_receipts.complete`; until then they keep scanning moderation_flags.
 * Dry run by default. `--apply` writes missing receipts, re-scans, and enables receipts only when
 * the re-scan finds none missing.
 */

// Standalone copy of functions/src/postReports.ts isPostReport: repository script tests run
// before Functions is built.
export function isPostReport(flag) {
  const metadata = flag.metadata;
  return flag.reason !== 'comment_filtered' && flag.reason !== 'profile_text_filtered'
    && typeof metadata?.comment_id !== 'string'
    && (metadata?.target == null || metadata.target === 'post');
}

/** Same document ID as submitReport (functions/src/reports.ts) for a post report. */
export function postReceiptId(viewer, postId) {
  return createHash('sha256').update(`${viewer}:post:${postId}`).digest('hex');
}

/** The receipt a reporter's flag implies, or null for flags that are not user post reports. */
export function receiptFor(flag) {
  const data = flag.data;
  if (!isPostReport(data) || typeof data.user_id !== 'string' || typeof data.post_id !== 'string') return null;
  const postId = data.post_id.toLowerCase();
  return { id: postReceiptId(data.user_id, postId), owner_luid: data.user_id, target_id: postId, flag_id: flag.id,
    created_at: data.created_at ?? null };
}

async function scan(db, apply, FieldValue, Timestamp) {
  let examined = 0, missing = 0, written = 0, pageCount = 0;
  const pages = readPages(async cursor => {
    if (pageCount++ >= 250) throw new Error('Scan exceeded 50,000 flags; extend the backfill before enabling receipts.');
    const base = db.collection('moderation_flags').orderBy('__name__');
    const docs = await (cursor ? base.startAfter(cursor) : base).limit(200).get();
    return { value: docs, next: docs.size < 200 ? undefined : docs.docs.at(-1) };
  });
  for await (const docs of pages) {
    const wanted = docs.docs.map(doc => receiptFor({ id: doc.id, data: doc.data() })).filter(Boolean);
    examined += docs.size;
    if (wanted.length) {
      const receipts = await db.getAll(...wanted.map(r => db.collection('report_receipts').doc(r.id)));
      const absent = wanted.filter((_, index) => !receipts[index].exists);
      missing += absent.length;
      if (apply && absent.length) {
        const posts = await db.getAll(...absent.map(r => db.collection('posts').doc(r.target_id)));
        await forEachSequential(absent, async (receipt, index) => {
          const creator = posts[index].get('creator_id');
          try {
            await db.collection('report_receipts').doc(receipt.id).create({
              owner_luid: receipt.owner_luid, target_luid: typeof creator === 'string' ? creator : null,
              target_kind: 'post', target_id: receipt.target_id, flag_id: receipt.flag_id,
              reported_at: receipt.created_at ?? Timestamp.fromMillis(0), backfilled_at: FieldValue.serverTimestamp(),
            });
            written++;
          } catch (error) {
            if (error?.code !== 6) throw error; // a live report created it meanwhile
          }
        });
      }
    }
    if (docs.size < 200) return { examined, missing, written, complete: true };
  }
  throw new Error('Scan did not complete.');
}

async function main(args) {
  const apply = args.includes('--apply');
  if (args.some(a => !['--apply', '--project', PROJECT].includes(a)) || args[args.indexOf('--project') + 1] !== PROJECT || !args.includes('--project')) {
    throw new Error(`Usage: node scripts/backfill-report-receipts.mjs --project ${PROJECT} [--apply]`);
  }
  Object.assign(process.env, deploymentEnvironment(process.env));
  const { initializeApp } = require('firebase-admin/app'), { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
  initializeApp({ projectId: PROJECT });
  const db = getFirestore(), marker = db.collection('system').doc('report_receipts');
  const before = await scan(db, apply, FieldValue, Timestamp);
  const after = apply ? await scan(db, false, FieldValue, Timestamp) : before;
  const enabled = apply && after.complete && after.missing === 0;
  if (enabled) await marker.set({ complete: true, verified_at: FieldValue.serverTimestamp(), flags_examined: after.examined }, { merge: true });
  if (apply && after.missing !== 0) throw new Error('Verification still found post reports without receipts; receipts stay disabled.');
  console.log(JSON.stringify({ apply, before, after, enabled }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
