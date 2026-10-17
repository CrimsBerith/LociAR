import { onCall } from 'firebase-functions/v2/https';
import { hasPostReport } from './postReports';
import { bucket, CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, FieldValue, HttpsError, isUUID, Timestamp } from './core';
import { requireCaller } from './core';
import { requireActiveAccount, profileBlock, accountDeletionRef } from './profileGuard';
import { isPublicActive } from './counters';
import { denseLocks } from './denseSpots';
import { bumpWindow } from './limits';
import { reasonError } from './errors';

const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES };
export const ANONYMOUS_MUTE_MINUTE_LIMIT = 5;
export const ANONYMOUS_MUTE_DAILY_LIMIT = 30;

/** Identity blocks between two accounts (profile "Block"); see visibility.ts for the semantics. */
export function identityBlockRefs(a: string, b: string) {
  return [db.collection('user_blocks').doc(`${a}_${b}`), db.collection('user_blocks').doc(`${b}_${a}`)];
}
export async function identityBlocked(a: string, b: string, tx?: FirebaseFirestore.Transaction): Promise<boolean> {
  const refs = identityBlockRefs(a, b);
  return (await (tx ? tx.getAll(...refs) : db.getAll(...refs))).some(doc => doc.exists);
}
/** The viewer's own mute of an anonymous author. Never consulted for attributed content. */
export const anonymousMuteRef = (viewer: string, author: string) => db.collection('anonymous_blocks').doc(`${viewer}_${author}`);

/**
 * Whether blocks hide this post from the viewer. Anonymous posts ignore identity blocks and honour
 * only the viewer's own mute, so a block can never be used to find out who wrote them.
 */
export async function contentBlocked(viewer: string, post: FirebaseFirestore.DocumentData, tx?: FirebaseFirestore.Transaction): Promise<boolean> {
  const author = String(post.creator_id);
  if (author === viewer) return false;
  if (post.is_anonymous === true) {
    const ref = anonymousMuteRef(viewer, author);
    return (await (tx ? tx.get(ref) : ref.get())).exists;
  }
  return identityBlocked(viewer, author, tx);
}

async function readablePost(postId: string, luid: string) {
  return db.runTransaction(async tx => {
    await requireActiveAccount(tx, luid);
    const snap = await tx.get(db.collection('posts').doc(postId));
    const post = snap.data();
    if (!post) throw new HttpsError('permission-denied', 'Post unavailable');
    await requireActiveAccount(tx, String(post.creator_id));
    if (post.deleted_at || !(post.creator_id === luid || isPublicActive(post))
      || await contentBlocked(luid, post, tx)) throw new HttpsError('permission-denied', 'Post unavailable');
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

/**
 * "Hide this author's notes" on an anonymous note. The mute stays server-only and affects only
 * anonymous content for this viewer (visibility.ts); exposing it or applying it to profiles would
 * reveal the author. Quotas stop a script from muting authors one by one at scale.
 */
export const blockPostAuthor = onCall(options, async request => {
  const caller = requireCaller(request), postId = requestedPost(request.data);
  const quotaRef = db.collection('anonymous_block_quota').doc(caller.luid);
  await db.runTransaction(async tx => {
    await requireActiveAccount(tx, caller.luid);
    const post = (await tx.get(db.collection('posts').doc(postId))).data();
    if (!post || !isPublicActive(post)) throw new HttpsError('permission-denied', 'Post unavailable');
    if (post.is_anonymous !== true) throw new HttpsError('invalid-argument', 'Block the profile instead');
    const target = String(post.creator_id);
    if (target === caller.luid) throw new HttpsError('invalid-argument', 'Cannot block yourself');
    await requireActiveAccount(tx, target);
    const [existing, quota] = await tx.getAll(anonymousMuteRef(caller.luid, target), quotaRef);
    // Muting an already muted author again is free and changes nothing.
    if (existing.exists) return;
    const now = Date.now();
    const minute = bumpWindow(quota.get('minute'), now, 60_000, ANONYMOUS_MUTE_MINUTE_LIMIT);
    const day = bumpWindow(quota.get('day'), now, 86_400_000, ANONYMOUS_MUTE_DAILY_LIMIT);
    if (!minute.allowed || !day.allowed) throw reasonError('resource-exhausted', 'Too many hidden authors; try again later', 'rate_limited');
    tx.set(quotaRef, { owner_luid: caller.luid, minute: minute.next, day: day.next, expires_at: Timestamp.fromMillis(now + 2 * 86_400_000) });
    tx.set(anonymousMuteRef(caller.luid, target), {
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
        if (profileBlock(author.data()) || deletion.exists || await contentBlocked(caller.luid, post.data()!, tx)) return null;
        return await hasPostReport(tx, caller.luid, post.id) ? null : post.get('caption');
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
