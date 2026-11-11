import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousTermsAccepted, MIN_ANONYMOUS_TERMS_VERSION, termsConsentUpdate } from '../lib/profile.js';

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

test('anonymous sessions accept the minimum terms version and any newer dated version', () => {
  assert.equal(anonymousTermsAccepted(MIN_ANONYMOUS_TERMS_VERSION), true);
  assert.equal(anonymousTermsAccepted('2026-12-01'), true, 'a newer app build needs no server deploy');
  assert.equal(anonymousTermsAccepted('2026-10-03'), false, 'an older version is refused');
  for (const bad of [undefined, null, 20261004, '', '2026-1-1', '2026-10-04T00:00:00Z', 'latest', '9999']) {
    assert.equal(anonymousTermsAccepted(bad), false, `rejects ${String(bad)}`);
  }
});
