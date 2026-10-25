import { deleteApp, getApp, initializeApp } from 'firebase-admin/app';

const args = process.argv.slice(2);
const projectFlag = args.find(arg => arg.startsWith('--project='));
const project = projectFlag?.slice('--project='.length);
const apply = args.includes('--apply'), activate = args.includes('--activate'), deactivate = args.includes('--deactivate');
if (!['lociar-2f38c', 'demo-lociar'].includes(project) || args.filter(arg => arg.startsWith('--project=')).length !== 1
    || args.some(arg => arg !== projectFlag && !['--apply', '--activate', '--deactivate'].includes(arg))
    || (activate || deactivate) && !apply || activate && deactivate) {
  throw new Error('Usage: node functions/scripts/backfill-note-approval.mjs --project=lociar-2f38c [--apply [--activate|--deactivate]]');
}
if (project === 'demo-lociar' && !process.env.FIRESTORE_EMULATOR_HOST
    || project === 'lociar-2f38c' && process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Project/emulator mismatch.');
process.env.GCLOUD_PROJECT = project;
initializeApp({ projectId: project });
const { db, FieldValue, Timestamp } = await import('../lib/core.js');
const { indexNotificationLike } = await import('../lib/noteAutomation.js');
const settings = db.collection('system').doc('place_notes');
try {
  if (deactivate) {
    await settings.set({ approval_index_version: 0 }, { merge: true });
    console.log(JSON.stringify({ project, indexedApproval: false }));
  } else {
    // Deploy matching onLikeCreated + the READY composite index before running this scan.
    // New edges are then covered by the trigger even if inserted behind this ID cursor.
    async function* documents(base) {
      let cursor;
      for (;;) {
        let query = base.orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        yield* page.docs;
        if (page.size < 100) return;
        cursor = page.docs.at(-1);
      }
    }
    async function pass(write) {
      let inspected = 0, eligible = 0, missing = 0, posts = 0;
      for await (const post of documents(db.collection('posts').where('note_kind', '==', 'location').select('note_kind', 'push_state'))) {
        if ((post.get('push_state') ?? 'none') !== 'none') continue;
        posts++;
        for await (const edge of documents(db.collection('likes').where('post_id', '==', post.id).select('post_id'))) {
          const result = await indexNotificationLike(edge.ref, write);
          inspected++; if (result.eligible) { eligible++; if (!result.indexed) missing++; }
        }
      }
      return { posts, inspected, eligible, missing };
    }
    const result = await pass(apply);
    console.log(JSON.stringify({ project, mode: apply ? 'apply' : 'dry-run', ...result }));
    if (activate) {
      const verified = await pass(false);
      if (verified.missing) throw new Error('Eligible likes are still missing index hints; activation refused.');
      // Prove that the live composite index is serving queries before changing the mode.
      await db.collection('likes').where('post_id', '==', '00000000-0000-4000-8000-000000000000')
        .where('notification_eligible_at', '<=', Timestamp.now()).orderBy('notification_eligible_at').orderBy('__name__').limit(1).get();
      await settings.set({ approval_index_version: 1, approval_index_verified_at: FieldValue.serverTimestamp() }, { merge: true });
      console.log(JSON.stringify({ project, indexedApproval: true, verified: verified.inspected }));
    }
  }
} finally { await deleteApp(getApp()); }
