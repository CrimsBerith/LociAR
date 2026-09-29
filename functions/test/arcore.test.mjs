import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArcoreClaims, tokenQuotaDocId, ARCORE_AUDIENCE } from '../lib/arcoreToken.js';

test('ARCore keyless claims follow the documented shape', () => {
  const claims = buildArcoreClaims('123-compute@developer.gserviceaccount.com', 1_700_000_000.9);
  assert.deepEqual(claims, {
    iss: '123-compute@developer.gserviceaccount.com',
    sub: '123-compute@developer.gserviceaccount.com',
    aud: ARCORE_AUDIENCE,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  assert.equal(ARCORE_AUDIENCE, 'https://arcore.googleapis.com/');
  assert.doesNotThrow(() => buildArcoreClaims('lociar-arcore@lociar-2f38c.iam.gserviceaccount.com', 0));
});

test('only Google service accounts can sign', () => {
  assert.throws(() => buildArcoreClaims('someone@gmail.com', 0));
  assert.throws(() => buildArcoreClaims('', 0));
});

test('rate-limit bucket changes every hour', () => {
  assert.equal(tokenQuotaDocId('u', 0), 'u_0');
  assert.equal(tokenQuotaDocId('u', 3_599_999), 'u_0');
  assert.equal(tokenQuotaDocId('u', 3_600_000), 'u_1');
});
