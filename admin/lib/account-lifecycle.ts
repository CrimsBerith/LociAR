import 'server-only';
import { createHash } from 'node:crypto';
import type { Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';

/** UUIDv5 mapping shared with Functions core.ts and iOS FirebaseIdentity.swift. */
export function luidForUid(uid: string): string {
  const namespace = Buffer.from('6f1c6d0e3b8a5c7e9f214c0a7d2e9b13', 'hex');
  const bytes = createHash('sha1').update(namespace).update(uid, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Any persistent deletion job is a tombstone, including completed jobs. */
export async function accountDeletionStarted(uid: string, tx?: Transaction): Promise<boolean> {
  const ref = adminDb().collection('account_deletion_jobs').doc(luidForUid(uid));
  return (await (tx ? tx.get(ref) : ref.get())).exists;
}
