import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('diagnostics monitoring is idempotent and preserves unrelated resources', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = spawnSync('python3', ['-B', 'scripts/test/diagnostics_monitoring_test.py'], {
    cwd: root, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
