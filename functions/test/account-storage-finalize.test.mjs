import test from 'node:test';
import assert from 'node:assert/strict';
// Storage trigger registration resolves its default bucket during module loading.
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-lociar', storageBucket: 'demo-lociar.appspot.com' });
process.env.GCLOUD_PROJECT = 'demo-lociar';
const { cleanupFinalizedAccountObject, onDeletedAccountObjectFinalized } = await import('../lib/accountStorageFinalize.js');

const luid = '11111111-1111-5111-8111-111111111111';
const object = { name: `avatars/${luid}/current/photo.jpg`, bucket: 'demo-bucket', generation: '9223372036854775000' };
const fixture = overrides => ({ bucketName: 'demo-bucket', shouldDelete: async () => true, deleteGeneration: async () => {}, ...overrides });

test('late cleanup preserves the exact generation and only known account-owned paths', async () => {
  const calls = [];
  const deps = fixture({ deleteGeneration: async (...args) => { calls.push(args); } });
  assert.equal(await cleanupFinalizedAccountObject(object, deps), 'deleted');
  assert.deepEqual(calls, [[object.name, object.generation]], 'large generations are never rounded through Number');
  for (const patch of [{ name: 'unrelated/object.jpg' }, { name: `backups/${luid}/object.jpg` }, { name: 'avatars/not-a-luid/object.jpg' }, { name: `avatars/${luid}/` }, { bucket: 'other-bucket' }]) {
    assert.equal(await cleanupFinalizedAccountObject({ ...object, ...patch }, deps), 'ignored');
  }
  assert.equal(calls.length, 1);
});

test('active or suspended accounts are preserved and invalid generations never cause an unconditional delete', async () => {
  let deletes = 0;
  const deps = fixture({ deleteGeneration: async () => { deletes++; } });
  assert.equal(await cleanupFinalizedAccountObject(object, fixture({ shouldDelete: async () => false })), 'ignored');
  for (const generation of [undefined, 0, '', 'not-a-generation', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(cleanupFinalizedAccountObject({ ...object, generation }, deps), /generation is unavailable/);
  }
  assert.equal(deletes, 0);
});

test('redelivery and generation replacement are harmless; transient Storage failures remain retryable', async () => {
  for (const [code, expected] of [[404, 'gone'], [412, 'replaced']]) {
    assert.equal(await cleanupFinalizedAccountObject(object, fixture({ deleteGeneration: async () => { throw Object.assign(new Error('synthetic'), { code }); } })), expected);
  }
  const outage = Object.assign(new Error('synthetic Storage outage'), { code: 503 });
  await assert.rejects(cleanupFinalizedAccountObject(object, fixture({ deleteGeneration: async () => { throw outage; } })), error => error === outage);
  const firestore = new Error('synthetic Firestore outage');
  await assert.rejects(cleanupFinalizedAccountObject(object, fixture({ shouldDelete: async () => { throw firestore; } })), error => error === firestore);
  assert.equal(onDeletedAccountObjectFinalized.__endpoint.eventTrigger.retry, true);
  assert.deepEqual(onDeletedAccountObjectFinalized.__endpoint.region, ['us-central1']);
});
