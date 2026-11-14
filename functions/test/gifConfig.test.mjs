import test from 'node:test';
import assert from 'node:assert/strict';
import { gifConfig } from '../lib/gifConfig.js';
import { isValidGifLayer, klipyGifLayer, resolveGifLayers } from '../lib/gifId.js';

test('gifConfig validates KLIPY key format and returns config object', () => {
  const validKey = 'emulatorKlipyKey0123456789abcdefABCDEF';
  assert.deepEqual(gifConfig(validKey), {
    provider: 'klipy',
    appKey: validKey,
    contentFilter: 'low',
    perPage: 24,
  });

  for (const bad of ['', '   ', 'short', 'has-dashes-123456789', 'invalid@char123456789', undefined, null]) {
    assert.throws(() => gifConfig(bad), (error) => error.details?.reason === 'gif_unavailable');
  }
});

test('klipyGifLayer validates slug and dimensions', () => {
  const valid = { provider: 'klipy', gifSlug: 'happy-cat-f7u--kOKp0sbu4', width: 480, height: 270 };
  assert.deepEqual(klipyGifLayer(valid), { gifSlug: 'happy-cat-f7u--kOKp0sbu4', width: 480, height: 270 });

  assert.equal(klipyGifLayer({ ...valid, provider: 'other' }), null);
  assert.equal(klipyGifLayer({ ...valid, gifSlug: '../evil' }), null);
  assert.equal(klipyGifLayer({ ...valid, gifSlug: '-invalid-start' }), null);
  assert.equal(klipyGifLayer({ ...valid, gifSlug: '' }), null);
  assert.equal(klipyGifLayer({ ...valid, width: 0 }), null);
  assert.equal(klipyGifLayer({ ...valid, height: 0 }), null);
  assert.equal(klipyGifLayer({ ...valid, width: 5000 }), null);
  assert.equal(klipyGifLayer({ ...valid, width: 480, height: 10 }), null, 'extreme aspect ratio rejected');
});

test('isValidGifLayer accepts exactly one provider format', () => {
  assert.equal(isValidGifLayer({ provider: 'klipy', gifSlug: 'cat-dance', width: 200, height: 200 }), true);
  assert.equal(isValidGifLayer({ gifId: 'l0MYt5jPR6QX5pnqM' }), false);

  // Both
  assert.equal(isValidGifLayer({ provider: 'klipy', gifSlug: 'cat-dance', width: 200, height: 200, gifId: 'l0MYt5jPR6QX5pnqM' }), false);
  // Neither
  assert.equal(isValidGifLayer({}), false);
  // Malformed
  assert.equal(isValidGifLayer({ provider: 'klipy', gifSlug: 'invalid/slug', width: 200, height: 200 }), false);
});

test('resolveGifLayers normalizes KLIPY layers without remote network lookup', async () => {
  const editData = {
    layers: [
      { id: 't1', type: 'text', text: 'Hello' },
      { id: 'g1', type: 'gif', provider: 'klipy', gifSlug: 'wednesday-dance', width: 480, height: 270, extraClientField: 'dropped' },
    ],
  };
  await resolveGifLayers(editData);
  assert.deepEqual(editData.layers[1], {
    id: 'g1',
    type: 'gif',
    provider: 'klipy',
    gifSlug: 'wednesday-dance',
    width: 480,
    height: 270,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
  });
});

