import { onCall } from 'firebase-functions/v2/https';
import { bucket, CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, isUUID } from './core';
import { requireCaller } from './core';
import { requireActiveAccount, profileBlock, accountDeletionRef } from './profileGuard';
import { isPublicActive } from './counters';
import { denseLocks } from './denseSpots';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };
export function blockRefs(a: string, b: string) {
  return ['user_blocks', 'anonymous_blocks'].flatMap(collection => [
    db.collection(collection).doc(`${a}_${b}`), db.collection(collection).doc(`${b}_${a}`),
  ]);
}
export async function isBlocked(a: string, b: string, tx?: FirebaseFirestore.Transaction): Promise<boolean> {
  const refs = blockRefs(a, b);
  return (await (tx ? tx.getAll(...refs) : db.getAll(...refs))).some(doc => doc.exists);
}

async function readablePost(postId: string, luid: string) {
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, luid);
    const snap = await tx.get(db.collection('posts').doc(postId));
    const post = snap.data();
    if (!post) throw new HttpsError('permission-denied', 'Post unavailable');
    await requireActiveAccount(tx, String(post.creator_id));
    if (post.deleted_at || !(post.creator_id === luid || isPublicActive(post))
      || await isBlocked(luid, String(post.creator_id), tx)) throw new HttpsError('permission-denied', 'Post unavailable');
    return post;
  });
}

function requestedPost(data: unknown): string {
  const id = (data as { postId?: unknown } | null)?.postId;
  if (!isUUID(id)) throw new HttpsError('invalid-argument', 'Invalid post ID');
  return id.toLowerCase();
}

export const readLikeCount = onCall(options, async request => {
  const caller = requireCaller(request), postId = requestedPost(request.data);
  await readablePost(postId, caller.luid);
  const count = await db.collection('likes').where('post_id', '==', postId).count().get();
  return { count: count.data().count };
});

/** The block target stays server-only; exposing the block edge would reveal the author. */
export const blockPostAuthor = onCall(options, async request => {
  const caller = requireCaller(request), postId = requestedPost(request.data);
  await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const post = (await tx.get(db.collection('posts').doc(postId))).data();
    if (!post || !isPublicActive(post)) throw new HttpsError('permission-denied', 'Post unavailable');
    const target = String(post.creator_id);
    if (target === caller.luid) throw new HttpsError('invalid-argument', 'Cannot block yourself');
    await requireActiveAccount(tx, target);
    tx.set(db.collection('anonymous_blocks').doc(`${caller.luid}_${target}`), {
      blocker_id: caller.luid, blocked_id: target, created_at: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

/** Bounded chunks avoid callable response limits. No bearer URL or owner folder is returned. */
export const readAnonymousWorldMap = onCall({ ...options, memory: '512MiB', timeoutSeconds: 60 }, async request => {
  const caller = requireCaller(request), postId = requestedPost(request.data);
  const offset = (request.data as { offset?: unknown }).offset;
  const chunkSize = 2 * 1024 * 1024;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset % chunkSize !== 0) {
    throw new HttpsError('invalid-argument', 'Invalid map offset');
  }
  const post = await readablePost(postId, caller.luid);
  const path = post.world_map_path;
  if (post.is_anonymous !== true || typeof path !== 'string'
    || !path.startsWith(`post-world-maps/${post.creator_id}/${postId}/`)) throw new HttpsError('permission-denied', 'Map unavailable');
  const file = bucket().file(path);
  const [metadata] = await file.getMetadata();
  const total = Number(metadata.size);
  if (!Number.isSafeInteger(total) || total < 64 || total >= 20 * 1024 * 1024 || offset >= total) {
    throw new HttpsError('failed-precondition', 'Invalid map size');
  }
  const pinned = bucket().file(path, { generation: metadata.generation });
  const chunks: Buffer[] = [];
  for await (const chunk of pinned.createReadStream({ start: offset, end: Math.min(offset + chunkSize, total) - 1 })) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  await readablePost(postId, caller.luid);
  return { data: bytes.toString('base64'), total, next: offset + bytes.length < total ? offset + bytes.length : null };
});

export const readActivity = onCall(options, async request => {
  const caller = requireCaller(request);
  await db.runTransaction(tx => requireActiveAccount(tx, caller.luid));
  let query = db.collection('activity_events').where('recipient_id', '==', caller.luid)
    .orderBy('created_at', 'desc').orderBy('__name__', 'desc');
  const cursor = (request.data as { cursor?: unknown } | null)?.cursor;
  if (cursor != null) {
    if (typeof cursor !== 'string' || cursor.length > 512 || cursor.includes('/')) throw new HttpsError('invalid-argument', 'Invalid cursor');
    const last = await db.collection('activity_events').doc(cursor).get();
    if (!last.exists || last.get('recipient_id') !== caller.luid) throw new HttpsError('invalid-argument', 'Invalid cursor');
    query = query.startAfter(last);
  }
  const page = await query.limit(51).get(), docs = page.docs.slice(0, 50);
  const items = await Promise.all(docs.map(async doc => {
    const data = doc.data();
    let body = data.body;
    if (data.kind === 'place_note') {
      body = await db.runTransaction(async tx => {
        await requireActiveAccount(tx, caller.luid);
        if (!isUUID(data.post_id)) return null;
        const post = await tx.get(db.collection('posts').doc(data.post_id));
        if (!post.exists || !isPublicActive(post.data())) return null;
        const [author, deletion] = await tx.getAll(db.collection('profiles').doc(post.get('creator_id')), accountDeletionRef(post.get('creator_id')));
        if (profileBlock(author.data()) || deletion.exists || await isBlocked(caller.luid, post.get('creator_id'), tx)) return null;
        const reports = await tx.get(db.collection('moderation_flags').where('user_id', '==', caller.luid).where('post_id', '==', post.id).limit(1));
        return reports.empty ? post.get('caption') : null;
      });
      if (body == null) return null;
      // A note in a dense spot stays closed in the activity list too until the viewer unlocks it on site.
      if ((await denseLocks([await db.collection('posts').doc(data.post_id).get()], caller.luid)).size) body = '';
    }
    return { id: doc.id, kind: data.kind, actor_id: data.anonymous === true ? null : data.actor_id ?? null,
      recipient_id: caller.luid, post_id: data.post_id ?? null, body,
      created_at: data.created_at.toDate().toISOString(), read_at: data.read_at?.toDate().toISOString() ?? null };
  }));
  return { items: items.filter(item => item !== null), next: page.size > 50 ? docs.at(-1)!.id : null };
});
