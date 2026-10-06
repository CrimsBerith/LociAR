import test from 'node:test';
import assert from 'node:assert/strict';
import { termsConsentUpdate } from '../lib/profile.js';

test('termsConsentUpdate accepts a newer dated version and ignores anything else', () => {
  assert.deepEqual(termsConsentUpdate('2026-10-04', undefined), { terms_version: '2026-10-04' });
  assert.deepEqual(termsConsentUpdate('2026-11-01', '2026-10-04'), { terms_version: '2026-11-01' });
  assert.equal(termsConsentUpdate('2026-10-04', '2026-10-04'), null);
  assert.equal(termsConsentUpdate('2026-10-04', '2026-11-01'), null, 'an older build never downgrades consent');
  assert.deepEqual(termsConsentUpdate('2026-10-04', 'garbage'), { terms_version: '2026-10-04' });
  for (const bad of [undefined, null, 20261004, '', 'latest', '2026-10-04T00:00:00Z', '2026-10-4']) {
    assert.equal(termsConsentUpdate(bad, undefined), null, `rejects ${String(bad)}`);
  }
});
