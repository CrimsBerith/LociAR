import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPrerequisites, completedTests, preflight, releaseSteps, runSteps } from '../release-preflight.mjs';
import { deploy, deploymentEnvironment } from '../firebase-deploy.mjs';

const completeNode = 'TAP version 13\n1..2\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 2.5\n';

test('Linux Java 21 runs the required gates; missing or old Java fails closed', () => {
  assert.doesNotThrow(() => checkPrerequisites(() => ({ status: 0, stderr: 'openjdk version "21.0.8"' })));
  for (const result of [{ status: 0, stderr: 'openjdk version "17.0.1"' }, { status: 1, stderr: 'missing' }, { error: new Error('ENOENT') }]) {
    assert.throws(() => checkPrerequisites(() => result), /Java 21/);
  }
});

test('a security-rule failure preserves status and prevents all later gates and Firebase calls', () => {
  const called = [];
  const validate = () => runSteps(releaseSteps(), { onStep() {}, runner(command, args) {
    called.push([command, ...args]);
    return { status: args.includes('test:rules') ? 42 : 0, stdout: completeNode };
  } });
  assert.throws(() => deploy({ validate, runner() { throw new Error('Deployment must not run'); } }), error => error.exitCode === 42);
  assert.ok(called.at(-1).includes('test:rules'));
  assert.equal(called.some(args => args.includes('test:emulator')), false);
});

test('an audit failure prevents emulator acceptance and deployment', () => {
  const called = [];
  assert.throws(() => runSteps(releaseSteps(), { onStep() {}, runner(command, args) {
    called.push(args);
    return { status: args.includes('check-dependency-audit.mjs') || args.includes('scripts/check-dependency-audit.mjs') ? 7 : 0, stdout: completeNode };
  } }), error => error.exitCode === 7);
  assert.equal(called.some(args => args.includes('test:rules')), false);
});

test('dry run validates but never selects live credentials or calls Firebase', () => {
  let checked = 0;
  deploy({ dryRun: true, env: { OIC_MANIFEST_PATH: '/must-not-read' }, validate() { checked++; }, runner() { throw new Error('Live call'); } });
  assert.equal(checked, 1);
});

test('plan mode does not even probe Java or execute tests', () => {
  assert.ok(preflight({ planOnly: true, runner() { throw new Error('No command may run'); } }).length > 0);
});

test('empty managed identity refuses platform bootstrap ADC, without reading the credential file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'loci-deploy-identity-'));
  try {
    const manifest = path.join(root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ version: 1, connections: [] }));
    assert.throws(() => deploymentEnvironment({ OIC_MANIFEST_PATH: manifest, GOOGLE_APPLICATION_CREDENTIALS: '/must-not-read' }), /authorized managed GCP/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Firebase project access failure prevents deploy and keeps its status', () => {
  const called = [];
  assert.throws(() => deploy({ env: {}, validate() {}, runner(command, args) { called.push(args); return { status: 13 }; } }), error => error.exitCode === 13);
  assert.deepEqual(called.map(args => args[0]), ['apps:list']);
});

test('successful deployment explicitly targets the fixed project and does not force resource deletion', () => {
  const called = [];
  deploy({ env: {}, validate() {}, runner(command, args) { called.push(args); return { status: 0 }; } });
  const args = called[1];
  assert.equal(args[0], 'deploy');
  assert.equal(args[args.indexOf('--project') + 1], 'lociar-2f38c');
  assert.equal(args.includes('--force'), false);
  assert.equal(args.includes('--non-interactive'), true);
  assert.throws(() => deploymentEnvironment({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /Emulator selectors/);
});

test('complete Node and Playwright summaries accept every passing test, with terminal colors', () => {
  assert.equal(completedTests(completeNode, 'node'), 2);
  assert.equal(completedTests(completeNode.replaceAll('\n', '\r\n'), 'node'), 2);
  assert.equal(completedTests('\u001b[32mRunning 8 tests using 2 workers\u001b[0m\n  8 passed (3.1s)\n', 'playwright'), 8);
});

test('missing, zero-test, truncated and ambiguous Node summaries cannot approve a release', () => {
  for (const output of [undefined, '', 'TAP version 13\nok 1 - first test\n',
    completeNode.replace('# duration_ms 2.5\n', ''),
    completeNode.replaceAll('2\n', '0\n'),
    completeNode + '# tests 2\n',
    completeNode.replace('# tests 2', '# tests 9007199254740992')]) {
    assert.throws(() => completedTests(output, 'node'));
  }
});

test('failed, skipped, cancelled and todo tests fail even when the command returns success', () => {
  for (const key of ['fail', 'skipped', 'cancelled', 'todo']) {
    const output = completeNode.replace(`# ${key} 0`, `# ${key} 1`);
    assert.throws(() => completedTests(output, 'node'));
  }
  assert.throws(() => completedTests(completeNode.replace('# pass 2', '# pass 1'), 'node'));
});

test('incomplete or interrupted Playwright runs cannot approve a release', () => {
  for (const output of ['', 'Running 8 tests using 2 workers\n',
    'Running 0 tests using 1 worker\n  0 passed\n',
    'Running 8 tests using 2 workers\n  6 passed\n  2 interrupted\n',
    'Running 8 tests using 2 workers\n  8 passed\n  1 skipped\n',
    'Running 8 tests using 2 workers\n  8 passed\n  8 passed\n']) {
    assert.throws(() => completedTests(output, 'playwright'));
  }
});

test('a zero-exit emulator shutdown with an incomplete child stops later checks and deployment', () => {
  const called = [];
  const steps = [
    { label: 'Emulator', command: 'firebase', args: [], testSummary: 'node' },
    { label: 'Later gate', command: 'must-not-run', args: [] },
  ];
  assert.throws(() => deploy({ dryRun: true, validate() {
    runSteps(steps, { onStep() {}, onOutput() {}, runner(command) {
      called.push(command);
      return { status: 0, stdout: 'TAP version 13\nok 1 - first test\n' };
    } });
  }, runner() { throw new Error('Deployment must not run'); } }), /incomplete test evidence/);
  assert.deepEqual(called, ['firebase']);
});

test('complete child evidence permits the next gate and keeps its output visible', () => {
  const called = [];
  const output = [];
  runSteps([
    { label: 'Tests', command: 'node', args: [], testSummary: 'node' },
    { label: 'Later gate', command: 'next', args: [] },
  ], { onStep() {}, onOutput: value => output.push(value), runner(command, args, options) {
    called.push(command);
    if (command === 'node') {
      assert.deepEqual(options.stdio, ['inherit', 'pipe', 'pipe']);
      return { status: 0, stdout: completeNode, stderr: 'child warning\n' };
    }
    assert.equal(options.stdio, 'inherit');
    return { status: 0 };
  } });
  assert.deepEqual(called, ['node', 'next']);
  assert.deepEqual(output, [completeNode, 'child warning\n']);
});
