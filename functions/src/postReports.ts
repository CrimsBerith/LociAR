import { db } from './core';

/** Parent post IDs on comment/user flags are navigation metadata, not reports of the post. */
export function isPostReport(flag: FirebaseFirestore.DocumentData): boolean {
  const metadata = flag.metadata;
  return flag.reason !== 'comment_filtered' && flag.reason !== 'profile_text_filtered'
    && typeof metadata?.comment_id !== 'string'
    && (metadata?.target == null || metadata.target === 'post');
}

/** A comment report must neither silence a note nor conceal a later report of that note. */
export async function hasPostReport(tx: FirebaseFirestore.Transaction, viewer: string, postId: string): Promise<boolean> {
  const base = db.collection('moderation_flags').where('user_id', '==', viewer).where('post_id', '==', postId).orderBy('__name__');
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await tx.get((cursor ? base.startAfter(cursor) : base).limit(200));
    if (page.docs.some(flag => isPostReport(flag.data()))) return true;
    if (page.size < 200) return false;
    cursor = page.docs.at(-1);
  }
}
