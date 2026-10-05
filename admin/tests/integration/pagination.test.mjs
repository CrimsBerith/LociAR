import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'A local Firestore emulator is required');
initializeApp({ projectId: 'demo-lociar' });
const { adminDb } = await import('../../lib/firebase-admin.ts');
const { readDocumentPage, readCaptionPage, InvalidCursorError } = await import('../../lib/pagination.ts');
after(async () => Promise.all(getApps().map(deleteApp)));

async function fixture(rows) {
  const collection = adminDb().collection(`pagination_test_${randomUUID()}`);
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = adminDb().batch();
    for (const [id, data] of rows.slice(offset, offset + 400)) batch.set(collection.doc(id), data);
    await batch.commit();
  }
  return collection;
}

const ids = page => page.documents.map(document => document.id);

test('forward and backward pages keep timestamp ties, including after the boundary document is deleted', async () => {
  const timestamp = new Timestamp(1_800_000_000, 123_456_789);
  const collection = await fixture(Array.from({ length: 7 }, (_, index) => [`row-${index}`, { created_at: timestamp }]));
  const first = await readDocumentPage(collection, { scope: 'ties', size: 3 });
  assert.deepEqual(ids(first), ['row-6', 'row-5', 'row-4']);
  assert.equal(first.previous, null);
  await collection.doc('row-4').delete();
  const second = await readDocumentPage(collection, { scope: 'ties', size: 3, cursors: { after: first.next } });
  assert.deepEqual(ids(second), ['row-3', 'row-2', 'row-1']);
  const previous = await readDocumentPage(collection, { scope: 'ties', size: 3, cursors: { before: second.previous } });
  assert.deepEqual(ids(previous), ['row-6', 'row-5']);
  assert.equal(previous.previous, null);
  const last = await readDocumentPage(collection, { scope: 'ties', size: 3, cursors: { after: second.next } });
  assert.deepEqual(ids(last), ['row-0']);
  assert.equal(last.next, null);
});

test('handle-prefix pagination retains the range and reaches tied names after the first page', async () => {
  const collection = await fixture([
    ['a', { handle: 'anna' }], ['b', { handle: 'anna' }], ['c', { handle: 'anne' }],
    ['outside-before', { handle: 'amy' }], ['outside-after', { handle: 'bob' }],
  ]);
  const query = collection.where('handle', '>=', 'ann').where('handle', '<=', 'ann\uf8ff');
  const options = { field: 'handle', direction: 'asc', scope: 'prefix:ann', size: 2 };
  const first = await readDocumentPage(query, options);
  const second = await readDocumentPage(query, { ...options, cursors: { after: first.next } });
  assert.deepEqual([...ids(first), ...ids(second)], ['a', 'b', 'c']);
  assert.equal(second.next, null);
});

test('caption search reaches the 501st older post after two empty result batches', async () => {
  const collection = await fixture(Array.from({ length: 501 }, (_, index) => [`post-${String(index).padStart(4, '0')}`, {
    created_at: Timestamp.fromMillis(1_800_000_000_000 - index),
    caption: index === 500 ? 'The UNIQUE OLD MATCH' : 'unrelated caption',
  }]));
  const options = { scope: 'caption:unique old match', needle: 'unique old match', size: 250 };
  const first = await readCaptionPage(collection, options);
  assert.equal(first.matches.length, 0);
  assert.ok(first.next, 'No-match batches must still offer continuation');
  const second = await readCaptionPage(collection, { ...options, cursors: { after: first.next } });
  assert.equal(second.matches.length, 0);
  assert.ok(second.next);
  const third = await readCaptionPage(collection, { ...options, cursors: { after: second.next } });
  assert.deepEqual(third.matches.map(document => document.id), ['post-0500']);
  assert.equal(third.next, null);
});

test('changing a status, term or sort rejects the previous cursor instead of silently skipping filtered records', async () => {
  const collection = await fixture(Array.from({ length: 3 }, (_, index) => [`post-${index}`, { status: 'active', created_at: Timestamp.fromMillis(index + 1) }]));
  const first = await readDocumentPage(collection.where('status', '==', 'active'), { scope: 'posts:active:term', size: 1 });
  await assert.rejects(readDocumentPage(collection, { scope: 'posts:removed:term', size: 1, cursors: { after: first.next } }), InvalidCursorError);
  await assert.rejects(readDocumentPage(collection, { scope: 'posts:active:other', size: 1, cursors: { after: first.next } }), InvalidCursorError);
  await assert.rejects(readDocumentPage(collection, { scope: 'posts:active:term', direction: 'asc', size: 1, cursors: { after: first.next } }), InvalidCursorError);
});

test('the native descending comment query exposes the 201st comment on reload and reaches all older pages', async () => {
  const collection = await fixture(Array.from({ length: 201 }, (_, index) => [`comment-${String(index).padStart(4, '0')}`, {
    post_id: 'one-post', created_at: new Timestamp(1_800_000_000, index),
  }]));
  const query = collection.where('post_id', '==', 'one-post').orderBy('created_at', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const first = await query.limit(51).get();
  assert.equal(first.docs[0].id, 'comment-0200');
  let documents = first.docs.slice(0, 50);
  const loaded = documents.map(document => document.id);
  while (documents.length) {
    const last = documents.at(-1);
    const next = await query.startAfter(last.get('created_at'), last.id).limit(51).get();
    documents = next.docs.slice(0, 50);
    loaded.push(...documents.map(document => document.id));
    if (next.size <= 50) break;
  }
  assert.equal(loaded.length, 201);
  assert.equal(new Set(loaded).size, 201);
  assert.equal(loaded.at(-1), 'comment-0000');
});
