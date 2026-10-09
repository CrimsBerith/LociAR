import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLinkPreview, storedContentSource } from '../lib/linkPreview.js';

const okFetch = (body, calls = []) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
};

test('youtube preview keeps title, author and an allowed thumbnail', async () => {
  const calls = [];
  const preview = await fetchLinkPreview('youtube', 'https://youtu.be/abc123', okFetch({
    title: '  Güzel\n şarkı ', author_name: 'Sanatçı', thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
  }, calls));
  assert.deepEqual(preview, { title: 'Güzel şarkı', author: 'Sanatçı', thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' });
  assert.match(calls[0].url, /^https:\/\/www\.youtube\.com\/oembed\?url=https%3A%2F%2Fyoutu\.be%2Fabc123&format=json$/);
  assert.ok(calls[0].init.signal);
});

test('thumbnails from unexpected hosts or schemes are dropped', async () => {
  const evil = await fetchLinkPreview('spotify', 'https://open.spotify.com/track/1', okFetch({
    title: 'T', thumbnail_url: 'https://evil.example/i.scdn.co/a.jpg',
  }));
  assert.deepEqual(evil, { title: 'T' });
  const http = await fetchLinkPreview('spotify', 'https://open.spotify.com/track/1', okFetch({
    title: 'T', thumbnail_url: 'http://i.scdn.co/a.jpg',
  }));
  assert.deepEqual(http, { title: 'T' });
  const suffix = await fetchLinkPreview('tiktok', 'https://www.tiktok.com/@u/video/1', okFetch({
    title: 'V', thumbnail_url: 'https://p16-sign-va.tiktokcdn.com/obj/a.jpeg',
  }));
  assert.equal(suffix.thumbnailUrl, 'https://p16-sign-va.tiktokcdn.com/obj/a.jpeg');
});

test('unsupported platforms, bad links and failures return null without throwing', async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true, text: async () => '{}' }; };
  assert.equal(await fetchLinkPreview('instagram', 'https://www.instagram.com/p/abc/', spy), null);
  assert.equal(await fetchLinkPreview('youtube', 'https://evil.example/watch?v=1', spy), null);
  assert.equal(await fetchLinkPreview('youtube', undefined, spy), null);
  assert.equal(called, false);
  assert.equal(await fetchLinkPreview('youtube', 'https://youtu.be/abc', async () => { throw new Error('boom'); }), null);
  assert.equal(await fetchLinkPreview('youtube', 'https://youtu.be/abc', async () => ({ ok: false, text: async () => '' })), null);
  assert.equal(await fetchLinkPreview('youtube', 'https://youtu.be/abc', okFetch('not json')), null);
  assert.equal(await fetchLinkPreview('youtube', 'https://youtu.be/abc', okFetch('x'.repeat(70000))), null);
  assert.equal(await fetchLinkPreview('youtube', 'https://youtu.be/abc', okFetch({})), null);
});

test('long titles are truncated', async () => {
  const preview = await fetchLinkPreview('youtube', 'https://youtu.be/abc', okFetch({ title: 'a'.repeat(500) }));
  assert.equal(Array.from(preview.title).length, 140);
});

test('stored content source drops client-supplied extra fields and uses the server preview', () => {
  const stored = storedContentSource(
    { platform: 'youtube', url: 'https://youtu.be/abc', mediaKind: 'embed', title: 'x', preview: { title: 'forged' }, junk: { a: 1 } },
    { title: 'real' },
  );
  assert.deepEqual(stored, { platform: 'youtube', url: 'https://youtu.be/abc', mediaKind: 'embed', title: 'x', preview: { title: 'real' } });
  assert.deepEqual(storedContentSource({ platform: 'other', title: 'Merhaba', preview: 5 }, null), { platform: 'other', title: 'Merhaba' });
  assert.equal(storedContentSource(null, null), null);
});
