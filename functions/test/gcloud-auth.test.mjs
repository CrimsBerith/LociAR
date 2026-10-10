import assert from 'node:assert/strict';
import test from 'node:test';
import { namedGcloudAuth } from '../scripts/gcloud-auth.mjs';

test('named OAuth uses only the selected gcloud identity and caches its token', async () => {
  const calls = [];
  const auth = namedGcloudAuth('release-operator', { inspectToken: async () => ({ expiry_date: Date.now() + 60 * 60_000 }), runner(command, args, options) {
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

test('operator OAuth respects the reported expiry and reselects the same identity after expiration', async () => {
  let selected = 0;
  let inspected = 0;
  const expiry = Date.now() + 10 * 60_000;
  const auth = namedGcloudAuth('release-operator', {
    runner() { selected++; return 'test-only-operator-token'; },
    async inspectToken(token) { inspected++; assert.equal(token, 'test-only-operator-token'); return { expiry_date: expiry }; },
  });
  await auth.getRequestHeaders('https://firestore.googleapis.com');
  const client = await auth.getClient();
  assert.equal(client.credentials.expiry_date, expiry);
  client.credentials.expiry_date = Date.now() - 1;
  await auth.getRequestHeaders('https://firestore.googleapis.com');
  assert.equal(selected, 2);
  assert.equal(inspected, 2);
});

test('unknown or expired operator token lifetime cannot be guessed or select fallback credentials', async () => {
  for (const expiry_date of [undefined, NaN, Date.now() - 1]) {
    const auth = namedGcloudAuth('release-operator', {
      runner: () => 'test-only-operator-token', inspectToken: async () => ({ expiry_date }),
    });
    await assert.rejects(auth.getRequestHeaders('https://firestore.googleapis.com'), /invalid token expiry/);
  }
});

test('missing operator configuration and empty tokens fail without falling back to ADC', async () => {
  for (const config of [undefined, '', 'invalid/config']) assert.throws(() => namedGcloudAuth(config));
  const auth = namedGcloudAuth('release-operator', { runner() { return ''; } });
  await assert.rejects(auth.getRequestHeaders('https://firestore.googleapis.com'), /no access token/);
});
