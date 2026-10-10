import assert from 'node:assert/strict';
import test from 'node:test';
import { namedGcloudAuth } from '../scripts/gcloud-auth.mjs';

test('named OAuth uses only the selected gcloud identity and caches its token', async () => {
  const calls = [];
  const auth = namedGcloudAuth('release-operator', { runner(command, args, options) {
    calls.push({ command, args, options });
    return 'test-only-operator-token\n';
  } });
  for (let i = 0; i < 2; i++) {
    const headers = await auth.getRequestHeaders('https://firestore.googleapis.com');
    assert.equal(headers.get('authorization'), 'Bearer test-only-operator-token');
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gcloud');
  assert.deepEqual(calls[0].args, ['--configuration=release-operator', '--project=lociar-2f38c', '--quiet', 'auth', 'print-access-token']);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('missing operator configuration and empty tokens fail without falling back to ADC', async () => {
  for (const config of [undefined, '', 'invalid/config']) assert.throws(() => namedGcloudAuth(config));
  const auth = namedGcloudAuth('release-operator', { runner() { return ''; } });
  await assert.rejects(auth.getRequestHeaders('https://firestore.googleapis.com'), /no access token/);
});
