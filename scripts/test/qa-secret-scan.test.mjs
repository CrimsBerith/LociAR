import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { scanRepository } from '../qa-secret-scan.mjs';

const scanner = fileURLToPath(new URL('../qa-secret-scan.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lociar-secret-scan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}
// Artificial values are assembled so the scanner also checks this test source.
const password = ['Review', 'syntheticfixture', '2026!'].join('_');
const assignment = (name, value) => `${name}=${JSON.stringify(value)}\n`;

test('finds review credentials in tracked Markdown, including files with spaces', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'Review notes.md'), `# Notes\n${password}\n`);
  execFileSync('git', ['add', '--', 'Review notes.md'], { cwd: root });
  assert.deepEqual(scanRepository(root), [{ path: 'Review notes.md', line: 2, rule: 'review-password' }]);
});

test('finds literal passwords in test sources and new scripts', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests', 'fixture.mjs'), assignment('PASSWORD', 'synthetic-test-value'));
  writeFileSync(join(root, 'run.command'), assignment('TEST_RUNNER_E2E_PASSWORD', 'synthetic-other-value'));
  assert.equal(scanRepository(root).filter(f => f.rule === 'literal-credential').length, 2);
});

test('finds passwords in Markdown fields and never prints their values', t => {
  const root = fixture(t);
  const value = 'synthetic-credential-value';
  writeFileSync(join(root, 'review.md'), `* **Şifre (Password):** \`${value}\`\n`);
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /document-password/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
});

test('ignored local credentials stay local; force-tracked environment files fail', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.gitignore'), '.env*\n');
  writeFileSync(join(root, '.env'), assignment('PASSWORD', 'synthetic-local-value'));
  assert.deepEqual(scanRepository(root), []);
  execFileSync('git', ['add', '-f', '.env'], { cwd: root });
  assert.ok(scanRepository(root).some(f => f.rule === 'credential-file'));
});

test('detects complete private keys and service-account JSON without logging key material', t => {
  const root = fixture(t);
  const label = ['PRIVATE', 'KEY'].join(' ');
  const material = `-----BEGIN ${label}-----\nsynthetic-key-material\n-----END ${label}-----`;
  writeFileSync(join(root, 'key.txt'), material);
  writeFileSync(join(root, 'account.json'), JSON.stringify({ type: ['service', 'account'].join('_') }));
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private-key/);
  assert.match(result.stderr, /service-account/);
  assert.ok(!result.stderr.includes('synthetic-key-material'));
});

test('allows documented placeholders and environment references', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.env.example'), assignment('PASSWORD', '<set-from-password-manager>'));
  writeFileSync(join(root, 'run.sh'), assignment('TEST_RUNNER_E2E_PASSWORD', '${E2E_PASSWORD}'));
  assert.deepEqual(scanRepository(root), []);
});

test('does not follow repository symlinks to local credential files', t => {
  const root = fixture(t);
  const local = mkdtempSync(join(tmpdir(), 'lociar-local-secret-'));
  t.after(() => rmSync(local, { recursive: true, force: true }));
  writeFileSync(join(local, 'secret'), password);
  symlinkSync(join(local, 'secret'), join(root, 'linked.txt'));
  assert.deepEqual(scanRepository(root), []);
});

for (const name of ['run-device-e2e-prod.command', 'run-device-e2e-prod-rest.command']) {
  test(`${name} stops before changing files when the password is missing`, t => {
    const root = fixture(t);
    mkdirSync(join(root, 'scripts', '.e2e'), { recursive: true });
    mkdirSync(join(root, 'Config'));
    copyFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), join(root, 'scripts', name));
    const config = join(root, 'Config', 'Local.xcconfig');
    const summary = join(root, 'scripts', '.e2e', name.includes('rest') ? 'summary-prod-rest.txt' : 'summary-prod.txt');
    writeFileSync(config, 'LOCIAR_EMULATOR_HOST = fixture\n');
    writeFileSync(summary, 'previous test evidence\n');
    const env = { ...process.env };
    delete env.TEST_RUNNER_E2E_PASSWORD;
    const result = spawnSync('bash', [join(root, 'scripts', name)], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_RUNNER_E2E_PASSWORD/);
    assert.equal(readFileSync(config, 'utf8'), 'LOCIAR_EMULATOR_HOST = fixture\n');
    assert.equal(readFileSync(summary, 'utf8'), 'previous test evidence\n');
    assert.ok(!existsSync(join(root, 'scripts', '.e2e', 'build-prod.log')));
  });
}
