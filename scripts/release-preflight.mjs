import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export function releaseSteps(root = REPOSITORY_ROOT) {
  const npm = (label, directory, args) => ({ label, command: 'npm', args, cwd: path.join(root, directory) });
  const node = (label, args) => ({ label, command: process.execPath, args, cwd: root });
  const scriptTests = readdirSync(path.join(root, 'scripts/test')).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'scripts/test/' + name);
  return [
    { ...node('Repository script regressions', ['--test', ...scriptTests]), testSummary: 'node' },
    node('Repository secret scan', ['scripts/qa-secret-scan.mjs']),
    node('Release localization', ['scripts/check-localization.mjs', '--release']),
    npm('Locked Functions installation', 'functions', ['ci', '--no-audit', '--no-fund']),
    npm('Locked admin installation', 'admin', ['ci', '--no-audit', '--no-fund']),
    npm('Functions types', 'functions', ['run', 'typecheck']),
    { ...npm('Functions unit tests and build', 'functions', ['test']), testSummary: 'node' },
    npm('Admin types', 'admin', ['run', 'typecheck']),
    { ...npm('Admin unit tests', 'admin', ['test']), testSummary: 'node' },
    npm('Functions production dependency audit', 'functions', ['audit', '--omit=dev', '--audit-level=moderate']),
    npm('Admin production dependency audit', 'admin', ['audit', '--omit=dev', '--audit-level=moderate']),
    node('Functions full dependency audit', ['scripts/check-dependency-audit.mjs', 'functions']),
    node('Admin full dependency audit', ['scripts/check-dependency-audit.mjs', 'admin']),
    { ...npm('Firestore and Storage rules', 'functions', ['run', 'test:rules']), testSummary: 'node' },
    { ...npm('Functions emulator acceptance', 'functions', ['run', 'test:emulator']), testSummary: 'node' },
    npm('Admin production test build', 'admin', ['run', 'build:ci']),
    { ...npm('Admin HTTP and authenticated browser acceptance', 'admin', ['run', 'test:emulator']), testSummary: 'node' },
    { ...npm('Public desktop and mobile browser acceptance', 'admin', ['run', 'test:e2e']), env: { ADMIN_E2E_PUBLIC_ONLY: '1' }, testSummary: 'playwright' },
  ];
}

// Emulator CLI shutdown can return 0 before its child finishes. Require the
// child's complete summary too; missing, empty or skipped runs are not a pass.
export function completedTests(output, format) {
  const clean = String(output ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  if (format === 'node') {
    const counts = {};
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const matches = [...clean.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
      if (matches.length !== 1) throw new Error('Missing or ambiguous Node test summary.');
      counts[key] = Number(matches[0][1]);
      if (!Number.isSafeInteger(counts[key])) throw new Error('Invalid Node test count.');
    }
    if (!/^TAP version 13\r?$/m.test(clean) || !/^# duration_ms \d+(?:\.\d+)?\r?$/m.test(clean) ||
      counts.tests <= 0 || counts.tests !== counts.pass ||
      ['fail', 'cancelled', 'skipped', 'todo'].some(key => counts[key] !== 0)) {
      throw new Error('Node tests did not complete with every test passing.');
    }
    return counts.tests;
  }
  if (format === 'playwright') {
    const started = [...clean.matchAll(/^Running (\d+) tests? using \d+ workers?\r?$/gm)];
    const passed = [...clean.matchAll(/^[ \t]*(\d+) passed\b/gm)];
    const count = Number(started[0]?.[1]);
    if (started.length !== 1 || passed.length !== 1 || !Number.isSafeInteger(count) || count <= 0 ||
      count !== Number(passed[0][1]) || /\b[1-9]\d* (?:failed|skipped|interrupted|did not run|flaky)\b/.test(clean)) {
      throw new Error('Playwright tests did not complete with every test passing.');
    }
    return count;
  }
  throw new Error('Unknown test summary format.');
}

export function runSteps(steps, { runner = spawnSync, env = process.env, onStep = step => console.log('==> ' + step.label), onOutput = value => process.stdout.write(value) } = {}) {
  for (const step of steps) {
    onStep(step);
    const result = runner(step.command, step.args, {
      cwd: step.cwd, env: { ...env, ...step.env, CI: '1' },
      ...(step.testSummary ? { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 } : { stdio: 'inherit' }),
    });
    if (step.testSummary) {
      if (result.stdout) onOutput(result.stdout);
      if (result.stderr) onOutput(result.stderr);
    }
    if (result.error) throw new Error(step.label + ': could not start command', { cause: result.error });
    if (result.status !== 0) {
      const error = new Error(step.label + ' failed; later checks and deployment were not executed.');
      error.exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
      throw error;
    }
    if (step.testSummary) {
      try {
        completedTests(result.stdout, step.testSummary);
      } catch (cause) {
        throw new Error(step.label + ': incomplete test evidence; later checks and deployment were not executed.', { cause });
      }
    }
  }
}

export function checkPrerequisites(runner = spawnSync) {
  if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Node.js 22 is required.');
  const result = runner('java', ['-version'], { encoding: 'utf8' });
  const major = /(?:openjdk|java) version "(\d+)/.exec((result.stderr ?? '') + (result.stdout ?? ''));
  if (result.error || result.status !== 0 || !major || Number(major[1]) < 21) throw new Error('Java 21 or newer is required; security-rule tests cannot be skipped.');
}

export function preflight({ planOnly = false, runner = spawnSync, root = REPOSITORY_ROOT, env = process.env } = {}) {
  const steps = releaseSteps(root);
  if (planOnly) return steps;
  checkPrerequisites(runner);
  runSteps(steps, { runner, env });
  return steps;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--plan')) throw new Error('Usage: node scripts/release-preflight.mjs [--plan]');
    const planned = process.argv.includes('--plan');
    const steps = preflight({ planOnly: planned });
    if (planned) for (const step of steps) console.log(step.label + ': ' + JSON.stringify([step.command, ...step.args]));
    else console.log('All local release checks passed. Native/device/live acceptance remains separate.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
