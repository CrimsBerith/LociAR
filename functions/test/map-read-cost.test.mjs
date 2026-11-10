import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { db } = await import('../lib/core.js');
const { visibleMapDocuments } = await import('../lib/publicContent.js');

const viewer = randomUUID();
const blocks = () => ({ identity: new Set(), muted: new Set() });
const post = author => ({ exists: true, data: () => ({ status: 'active', visibility: 'public', age_rating: 'all' }),
  get: key => ({ creator_id: author, is_anonymous: true, lat: 41, lng: 29 })[key] });

test('a large map group reads each author fence once per request and rechecks on the next request', async t => {
  const author = randomUUID(), docs = Array.from({ length: 260 }, () => post(author));
  let suspended = false;
  const batches = [];
  t.mock.method(db, 'getAll', async (...refs) => {
    batches.push(refs.map(ref => ref.path));
    return refs.map(ref => ({ exists: ref.parent.id === 'profiles', get: key => key === 'suspended' && suspended }));
  });
  assert.equal((await visibleMapDocuments(docs, viewer, blocks())).length, 260);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [`profiles/${author}`, `account_deletion_jobs/${author}`]);
  suspended = true;
  assert.equal((await visibleMapDocuments(docs, viewer, blocks())).length, 0);
  assert.equal(batches.length, 2, 'authorization is never cached between requests');
});

test('many distinct authors stay bounded and anonymous mutes remain independent from identity blocks', async t => {
  const authors = Array.from({ length: 201 }, () => randomUUID()), batches = [];
  t.mock.method(db, 'getAll', async (...refs) => {
    batches.push(refs.length);
    return refs.map(ref => ({ exists: ref.parent.id === 'profiles', get: () => false }));
  });
  const blocked = blocks(); blocked.identity.add(authors[0]); blocked.muted.add(authors[1]);
  const allowed = await visibleMapDocuments(authors.map(post), viewer, blocked);
  assert.equal(allowed.length, 200);
  assert.equal(allowed[0].get('creator_id'), authors[0]);
  assert.deepEqual(batches, [200, 200, 2]);
});
