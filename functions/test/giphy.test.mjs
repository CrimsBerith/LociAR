import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGif, giphyBaseURL, giphyLanguage, resolveGifLayers, searchURL, summarizeGif } from '../lib/giphy.js';

const raw = (extra = {}) => ({
  id: 'l0MYt5jPR6QX5pnqM', title: 'Happy Dance', rating: 'g', url: 'https://giphy.com/gifs/x', user: { username: 'someone' },
  images: { original: { width: '480', height: '270', mp4: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.mp4' } },
  ...extra,
});
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('a GIF summary keeps only the id, title and original size', () => {
  assert.deepEqual(summarizeGif(raw()), { id: 'l0MYt5jPR6QX5pnqM', title: 'Happy Dance', width: 480, height: 270 });
  for (const rating of ['r', 'nc-17', '', undefined]) assert.equal(summarizeGif(raw({ rating })), null, String(rating));
  assert.equal(summarizeGif(raw({ id: '../evil' })), null);
  assert.equal(summarizeGif(raw({ images: { original: { width: '0', height: '10' } } })), null);
  assert.equal(summarizeGif(raw({ images: { original: { width: '9000', height: '10' } } })), null);
  assert.equal(summarizeGif(null), null);
});

test('search uses the configured rating and falls back to trending for an empty query', () => {
  const search = new URL(searchURL('KEY', 'kedi', 24, 'tr', 'https://api.giphy.com'));
  assert.equal(search.pathname, '/v1/gifs/search');
  assert.equal(search.searchParams.get('q'), 'kedi');
  assert.equal(search.searchParams.get('rating'), 'pg-13');
  assert.equal(search.searchParams.get('lang'), 'tr');
  assert.equal(search.searchParams.get('offset'), '24');
  assert.equal(new URL(searchURL('KEY', '', 0, 'en', 'https://api.giphy.com')).pathname, '/v1/gifs/trending');
  assert.equal(giphyLanguage('zh-Hans'), 'zh-CN');
  assert.equal(giphyLanguage('pt-BR'), 'pt');
  assert.equal(giphyLanguage('xx'), 'en');
  assert.equal(giphyLanguage(undefined), 'en');
});

test('the GIPHY host can be replaced only in the emulator', () => {
  assert.equal(giphyBaseURL({ GIPHY_API_BASE_URL: 'http://127.0.0.1:1/' }), 'https://api.giphy.com');
  assert.equal(giphyBaseURL({ FUNCTIONS_EMULATOR: 'true', GIPHY_API_BASE_URL: 'http://127.0.0.1:1/' }), 'http://127.0.0.1:1');
});

test('fetchGif rejects unknown ids and never sends an invalid id to GIPHY', async () => {
  const seen = [];
  const fetcher = async (url) => { seen.push(url); return url.includes('/missing') ? response(404, {}) : response(200, { data: raw() }); };
  assert.deepEqual(await fetchGif('l0MYt5jPR6QX5pnqM', 'KEY', fetcher, 'https://api.giphy.com'), { id: 'l0MYt5jPR6QX5pnqM', title: 'Happy Dance', width: 480, height: 270 });
  assert.equal(await fetchGif('missing', 'KEY', fetcher, 'https://api.giphy.com'), null);
  assert.equal(await fetchGif('a/b', 'KEY', fetcher, 'https://api.giphy.com'), null);
  assert.equal(seen.length, 2);
  await assert.rejects(fetchGif('abc', 'KEY', async () => response(500, {}), 'https://api.giphy.com'), /giphy_http_500/);
});

test('resolveGifLayers keeps only the id and GIPHY size; unknown or unreachable GIFs fail closed', async () => {
  process.env.GIPHY_API_KEY = 'fake-api-key';
  const editData = { layers: [{ id: 't', type: 'text', text: 'Selam' }, { id: 'g', type: 'gif', gifId: 'l0MYt5jPR6QX5pnqM', width: 9999, height: 1, title: 'x', uri: '' }] };
  await resolveGifLayers(editData, async () => response(200, { data: raw() }));
  assert.deepEqual(editData.layers[0], { id: 't', type: 'text', text: 'Selam' });
  assert.deepEqual(editData.layers[1], { id: 'g', type: 'gif', gifId: 'l0MYt5jPR6QX5pnqM', width: 480, height: 270, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, zIndex: 0 });

  const missing = { layers: [{ id: 'g', type: 'gif', gifId: 'gone' }] };
  await assert.rejects(resolveGifLayers(missing, async () => response(404, {})), (error) => error.details?.reason === 'gif_invalid');
  const adult = { layers: [{ id: 'g', type: 'gif', gifId: 'abc' }] };
  await assert.rejects(resolveGifLayers(adult, async () => response(200, { data: raw({ id: 'abc', rating: 'r' }) })), (error) => error.details?.reason === 'gif_invalid');
  const down = { layers: [{ id: 'g', type: 'gif', gifId: 'abc' }] };
  await assert.rejects(resolveGifLayers(down, async () => { throw new Error('ECONNRESET'); }), (error) => error.details?.reason === 'gif_unavailable');
  assert.deepEqual(down.layers[0], { id: 'g', type: 'gif', gifId: 'abc' }, 'a failed lookup leaves nothing half-resolved');
  delete process.env.GIPHY_API_KEY;
});
