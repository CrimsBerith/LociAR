import { createHash } from 'node:crypto';
import { db } from './core';

/** Parent post IDs on comment/user flags are navigation metadata, not reports of the post. */
export function isPostReport(flag: FirebaseFirestore.DocumentData): boolean {
  const metadata = flag.metadata;
  return flag.reason !== 'comment_filtered' && flag.reason !== 'profile_text_filtered'
    && typeof metadata?.comment_id !== 'string'
    && (metadata?.target == null || metadata.target === 'post');
}

/** submitReport's receipt for a post report (reports.ts); comment and user reports hash differently. */
export function postReportReceiptRef(viewer: string, postId: string) {
  return db.collection('report_receipts').doc(createHash('sha256').update(`${viewer}:post:${postId}`).digest('hex'));
}

/**
 * Receipts exist only for reports filed since 10 Nov 2026. scripts/backfill-report-receipts.mjs
 * writes them for older post reports and then sets `system/report_receipts.complete`; until then
 * the flag scan stays authoritative. Cached per instance so the flag costs one read per 10 minutes.
 */
const RECEIPT_FLAG_TTL_MS = 10 * 60_000;
let receiptFlag: { value: boolean; readAt: number } | null = null;
async function receiptsAuthoritative(now = Date.now()): Promise<boolean> {
  if (receiptFlag && now - receiptFlag.readAt < RECEIPT_FLAG_TTL_MS) return receiptFlag.value;
  const value = await db.collection('system').doc('report_receipts').get()
    .then(snap => snap.get('complete') === true).catch(() => false);
  receiptFlag = { value, readAt: now };
  return value;
}

/** Posts the viewer has reported, in one batched read once receipts are authoritative. */
export async function reportedPostIds(tx: FirebaseFirestore.Transaction, viewer: string, postIds: readonly string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  if (await receiptsAuthoritative()) {
    const receipts = await tx.getAll(...postIds.map(id => postReportReceiptRef(viewer, id)));
    return new Set(postIds.filter((_, index) => receipts[index].exists));
  }
  const reported = await Promise.all(postIds.map(id => hasPostReportFlag(tx, viewer, id)));
  return new Set(postIds.filter((_, index) => reported[index]));
}

export async function hasPostReport(tx: FirebaseFirestore.Transaction, viewer: string, postId: string): Promise<boolean> {
  return (await reportedPostIds(tx, viewer, [postId])).has(postId);
}

/** A comment report must neither silence a note nor conceal a later report of that note. */
async function hasPostReportFlag(tx: FirebaseFirestore.Transaction, viewer: string, postId: string): Promise<boolean> {
  const base = db.collection('moderation_flags').where('user_id', '==', viewer).where('post_id', '==', postId).orderBy('__name__');
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await tx.get((cursor ? base.startAfter(cursor) : base).limit(200));
    if (page.docs.some(flag => isPostReport(flag.data()))) return true;
    if (page.size < 200) return false;
    cursor = page.docs.at(-1);
  }
}
