import { db, isUUID } from './core';
import { anonymousMuteRef, identityBlockRefs } from './anonymousAccess';
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
  // Anonymous notes honour only the viewer's own mute and attributed notes only identity blocks
  // (visibility.ts), so a block never reveals which notes an account wrote anonymously.
  const anonymousAuthors = new Set(candidates.filter(post => post.get('is_anonymous') === true).map(post => String(post.get('creator_id'))));
  const attributedAuthors = new Set(candidates.filter(post => post.get('is_anonymous') !== true).map(post => String(post.get('creator_id'))));
  const refs = active.flatMap(author => [
    ...(anonymousAuthors.has(author) ? [anonymousMuteRef(viewer, author)] : []),
    ...(attributedAuthors.has(author) ? identityBlockRefs(viewer, author) : []),
  ]);
  const blocks = new Map((refs.length ? await tx.getAll(...refs) : []).map(record => [record.ref.path, record.exists]));
  const activeSet = new Set(active);
  const hidden = (post: FirebaseFirestore.DocumentSnapshot) => {
    const author = String(post.get('creator_id'));
    if (!activeSet.has(author)) return true;
    return post.get('is_anonymous') === true
      ? blocks.get(anonymousMuteRef(viewer, author).path) === true
      : identityBlockRefs(viewer, author).some(ref => blocks.get(ref.path) === true);
  };
  // Each note is checked independently; comment flags do not silence the parent note.
  const checks = await Promise.all(candidates.filter(post => !hidden(post)).map(async post => {
    return await hasPostReport(tx, viewer, post.id) ? null : post.id;
  }));
  return new Set(checks.filter((id): id is string => id !== null));
}
