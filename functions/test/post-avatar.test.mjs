import test from 'node:test';
import assert from 'node:assert/strict';
const { postAvatarURL } = await import('../lib/profileGuard.js');

test('posts carry an uploaded avatar, else the preset as an avatar-preset URL, else none', () => {
  assert.equal(postAvatarURL({ avatar_url: 'storage://avatars/a/current/b.jpg', avatar_preset: 'cat' }), 'storage://avatars/a/current/b.jpg');
  assert.equal(postAvatarURL({ avatar_url: null, avatar_preset: 'cat' }), 'avatar-preset:cat');
  assert.equal(postAvatarURL({ avatar_preset: 'unicorn' }), null);
  assert.equal(postAvatarURL(undefined), null);
});
