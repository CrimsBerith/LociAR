import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueAvatarDelete } from '../lib/avatar.js';

const luid = '11111111-1111-5111-8111-111111111111';
const id = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const recorder = () => { const writes = []; return { writes, set: (ref, data) => writes.push({ id: ref.id, data }) }; };

test('enqueueAvatarDelete accepts only the owner\'s current or pending JPEG', () => {
  for (const folder of ['current', 'pending']) {
    const tx = recorder();
    enqueueAvatarDelete(tx, luid, `avatars/${luid}/${folder}/${id}.jpg`);
    assert.equal(tx.writes.length, 1);
    assert.equal(tx.writes[0].id, `${id}_${folder}`);
    assert.equal(tx.writes[0].data.path, `avatars/${luid}/${folder}/${id}.jpg`);
  }
});

test('enqueueAvatarDelete refuses other users, folders, names and pattern-like luids', () => {
  const other = '22222222-2222-5222-8222-222222222222';
  for (const [owner, path] of [
    [luid, `avatars/${other}/current/${id}.jpg`],
    [luid, `avatars/${luid}/archive/${id}.jpg`],
    [luid, `avatars/${luid}/current/${id}.png`],
    [luid, `avatars/${luid}/current/../${id}.jpg`],
    [luid, `post-layer-assets/${luid}/current/${id}.jpg`],
    ['.*', `avatars/${other}/current/${id}.jpg`],
  ]) {
    const tx = recorder();
    assert.throws(() => enqueueAvatarDelete(tx, owner, path), /invalid_avatar_deletion_path/, path);
    assert.equal(tx.writes.length, 0);
  }
});
