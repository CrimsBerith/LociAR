import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { adminDb } from './_harness.mjs';
import { onDeletedAccountObjectFinalized } from '../../lib/accountStorageFinalize.js';

const bucket = () => getStorage().bucket();
function finalizedEvent(file) {
  const metadata = file.metadata;
  assert.ok(metadata.generation, 'emulator save includes the exact finalized generation');
  // Storage SDK calls such as exists() may replace file.metadata after deletion. A redelivered
  // event retains its original generation independently of that mutable File instance.
  return Object.freeze({ data: { message: { attributes: Object.freeze({
    eventType: 'OBJECT_FINALIZE', payloadFormat: 'NONE', bucketId: bucket().name,
    objectId: file.name, objectGeneration: String(metadata.generation),
  }) } } });
}

test('an upload finalized after a completed account deletion is removed without an Auth/profile record', async () => {
  const luid = randomUUID();
  await adminDb.collection('account_deletion_jobs').doc(luid).set({ status: 'done' });
  await adminDb.collection('account_access').doc(luid).set({ state: 'done' });
  for (const folder of ['post-world-maps', 'avatars']) {
    const file = bucket().file(`${folder}/${luid}/${folder === 'avatars' ? 'current/photo.jpg' : `${randomUUID()}/late.lociarmap`}`);
    await file.save(Buffer.from('already-authorized upload finished late'));
    const event = finalizedEvent(file);
    assert.ok(['deleted', 'gone'].includes(await onDeletedAccountObjectFinalized.run(event)));
    assert.equal((await file.exists())[0], false);
    assert.equal(await onDeletedAccountObjectFinalized.run(event), 'gone', 'redelivered finalize is idempotent');
  }
});

test('a pending deletion or legacy deleting access fence also removes late Storage finalization', async () => {
  for (const gate of ['job-only', 'access-only']) {
    const luid = randomUUID();
    if (gate === 'job-only') await adminDb.collection('account_deletion_jobs').doc(luid).set({ status: 'pending' });
    else await adminDb.collection('account_access').doc(luid).set({ state: 'deleting' });
    const file = bucket().file(`avatars/${luid}/pending/photo.jpg`);
    await file.save(Buffer.from('late avatar bytes'));
    assert.ok(['deleted', 'gone'].includes(await onDeletedAccountObjectFinalized.run(finalizedEvent(file))));
    assert.equal((await file.exists())[0], false);
  }
});

test('Storage finalize preserves active/suspended accounts and unknown paths belonging to a deleted identifier', async () => {
  for (const state of ['active', 'suspended']) {
    const luid = randomUUID();
    await adminDb.collection('account_access').doc(luid).set({ state });
    const file = bucket().file(`avatars/${luid}/current/photo.jpg`);
    await file.save(Buffer.from('preserve this account'));
    assert.equal(await onDeletedAccountObjectFinalized.run(finalizedEvent(file)), 'ignored');
    assert.equal((await file.exists())[0], true);
    await file.delete();
  }
  const luid = randomUUID();
  await adminDb.collection('account_deletion_jobs').doc(luid).set({ status: 'done' });
  const unknown = bucket().file(`unrelated-backups/${luid}/keep.bin`);
  await unknown.save(Buffer.from('unrelated namespace'));
  assert.equal(await onDeletedAccountObjectFinalized.run(finalizedEvent(unknown)), 'ignored');
  assert.equal((await unknown.exists())[0], true);
  await unknown.delete();
});
