import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Firebase metadata acceptance and identity selectors pass the offline Python regressions', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/test', '-p', 'firebase_readiness_test.py'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined, 'Python 3 is required for Firebase readiness acceptance');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
