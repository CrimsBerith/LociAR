import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Synthetic commands prove exit propagation only; these are not iOS build tests.
function fixture(script) {
  const root = mkdtempSync(path.join(tmpdir(), 'loci-ios-exit-'));
  mkdirSync(path.join(root, 'scripts')); mkdirSync(path.join(root, 'bin'));
  copyFileSync(new URL(`../${script}`, import.meta.url), path.join(root, 'scripts', script));
  return root;
}
function command(root, name, body) {
  writeFileSync(path.join(root, 'bin', name), '#!/bin/sh\n' + body, { mode: 0o755 });
}
test('check-build preserves a failing xcodebuild status instead of returning tail success', () => {
  const root = fixture('check-build.command');
  try {
    command(root, 'xcodebuild', 'echo "Synthetic build failure"\nexit 42\n');
    const result = spawnSync('bash', [path.join(root, 'scripts/check-build.command')], { env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8' });
    assert.equal(result.status, 42); assert.match(result.stdout, /exit=42/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CI stops on the native test failure even though tee successfully writes its log', () => {
  const root = fixture('ci-ios.sh');
  try {
    command(root, 'xcodebuild', 'case " $* " in\n *" -version "*) exit 0;;\n *" -resolvePackageDependencies "*) exit 0;;\n *) echo "Synthetic native test failure"; exit 42;;\nesac\n');
    command(root, 'xcrun', "printf '%s\\n' '{\"devices\":{\"iOS-26\":[{\"name\":\"iPhone fixture\",\"udid\":\"fixture\",\"isAvailable\":true}]}}'\n");
    const result = spawnSync('bash', [path.join(root, 'scripts/ci-ios.sh')], { env: { ...process.env, LOCIAR_IOS_CI_OUTPUT: path.join(root, 'output'), PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8' });
    assert.equal(result.status, 42); assert.match(result.stdout, /Synthetic native test failure/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
