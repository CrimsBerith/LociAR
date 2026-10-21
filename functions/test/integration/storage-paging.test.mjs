import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newUser } from './_harness.mjs';
import { bucket } from '../../lib/core.js';
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/);
after(closeClients);

test('own-post deletion removes all storage objects across SDK listing pages and preserves another prefix', async () => {
  const author = await newUser(), id = randomUUID();
  const prefix = `post-world-maps/${author.luid}/${id}/`, other = `post-world-maps/${author.luid}/${randomUUID()}/keep`;
  await adminDb.collection('posts').doc(id).set({ creator_id: author.luid, status: 'active', visibility: 'public' });
  for (let offset = 0; offset < 107; offset += 10) {
    await Promise.all(Array.from({ length: Math.min(10, 107 - offset) }, (_, i) => bucket().file(prefix + String(offset + i).padStart(3, '0')).save(Buffer.from('synthetic emulator media'))));
  }
  await bucket().file(other).save(Buffer.from('keep'));
  try {
    await author.call('deleteOwnPost', { postId: id });
    assert.equal((await bucket().getFiles({ prefix }))[0].length, 0);
    assert.equal((await bucket().file(other).exists())[0], true);
  } finally { await bucket().file(other).delete({ ignoreNotFound: true }); }
});
