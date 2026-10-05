import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createReviewCredentialsFile } from '../scripts/review-credentials.mjs';

function temporaryDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), 'lociar-review-credentials-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('review credentials are randomly generated and written with owner-only permissions', t => {
  const root = temporaryDirectory(t);
  const first = createReviewCredentialsFile(join(root, 'first.json'), 'fixture@example.test');
  const second = createReviewCredentialsFile(join(root, 'second.json'), 'fixture@example.test');
  assert.match(first.password, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.password, second.password);
  assert.equal(statSync(first.filePath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(first.filePath)), { email: 'fixture@example.test', password: first.password });
});

test('review credentials refuse missing, relative, and repository output paths', () => {
  assert.throws(() => createReviewCredentialsFile(undefined, 'fixture@example.test'), /absolute path/);
  assert.throws(() => createReviewCredentialsFile('credentials.json', 'fixture@example.test'), /absolute path/);
  const target = fileURLToPath(new URL('../../blocked.credentials.json', import.meta.url));
  assert.throws(() => createReviewCredentialsFile(target, 'fixture@example.test'), /outside the repository/);
  assert.equal(existsSync(target), false);
});

test('review credential output refuses existing files without overwriting them', t => {
  const root = temporaryDirectory(t);
  const target = join(root, 'existing.json');
  writeFileSync(target, 'previous content');
  assert.throws(() => createReviewCredentialsFile(target, 'fixture@example.test'), { code: 'EEXIST' });
  assert.equal(readFileSync(target, 'utf8'), 'previous content');
});

test('review credential output rejects symlink parents pointing into the repository', t => {
  const root = temporaryDirectory(t);
  symlinkSync(fileURLToPath(new URL('../../', import.meta.url)), join(root, 'checkout'));
  assert.throws(() => createReviewCredentialsFile(join(root, 'checkout', 'blocked.credentials.json'), 'fixture@example.test'), /outside the repository/);
});

test('review credential output refuses a symlink instead of following it', t => {
  const root = temporaryDirectory(t);
  const target = join(root, 'existing.json');
  writeFileSync(target, 'previous content');
  symlinkSync(target, join(root, 'link.json'));
  assert.throws(() => createReviewCredentialsFile(join(root, 'link.json'), 'fixture@example.test'), { code: 'EEXIST' });
  assert.equal(readFileSync(target, 'utf8'), 'previous content');
});
