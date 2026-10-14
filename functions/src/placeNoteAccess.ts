import { db, isUUID } from './core';
import { blockRefs } from './anonymousAccess';
import { isPublicActive } from './counters';
import { accountDeletionRef, profileBlock } from './profileGuard';
import { hasPostReport } from './postReports';

export function noteCandidate(post: FirebaseFirestore.DocumentSnapshot, viewer: string): boolean {
  const data = post.data();
  return !!data && isPublicActive(data) && data.push_state === 'approved' && isUUID(data.creator_id) && data.creator_id !== viewer;
}

/** All data is local to this transaction attempt. Never reuse across requests or retries. */
export async function readableNoteIds(tx: FirebaseFirestore.Transaction, posts: FirebaseFirestore.DocumentSnapshot[], viewer: string): Promise<Set<string>> {
  const candidates = posts.filter(post => noteCandidate(post, viewer));
  if (!candidates.length) return new Set();
  const authors = [...new Set(candidates.map(post => String(post.get('creator_id'))))];
  // Batch by author, but avoid block reads entirely for suspended/deleted/missing authors.
  const records = await tx.getAll(...authors.flatMap(author => [db.collection('profiles').doc(author), accountDeletionRef(author)]));
  const active = authors.filter((_, index) => !profileBlock(records[index * 2].data()) && !records[index * 2 + 1].exists);
  if (!active.length) return new Set();
  const groups = active.map(author => blockRefs(viewer, author));
  const blocks = new Map((await tx.getAll(...groups.flat())).map(record => [record.ref.path, record.exists]));
  const visible = new Set(active.filter((_, index) => !groups[index].some(ref => blocks.get(ref.path))));
  // Each note is checked independently; comment flags do not silence the parent note.
  const checks = await Promise.all(candidates.filter(post => visible.has(post.get('creator_id'))).map(async post => {
    return await hasPostReport(tx, viewer, post.id) ? null : post.id;
  }));
  return new Set(checks.filter((id): id is string => id !== null));
}
