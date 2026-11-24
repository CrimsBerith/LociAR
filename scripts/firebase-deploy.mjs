import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preflight, REPOSITORY_ROOT } from './release-preflight.mjs';

export const PROJECT = 'lociar-2f38c';
const REGION = 'us-central1';

/**
 * Functions removed from functions/src. Deploys target each function with `--only functions:<name>`,
 * which never deletes anything, so these are deleted explicitly once the new code is live. Deleting a
 * scheduled function also deletes its Cloud Scheduler job: the seven retired schedules now run as tasks
 * of the three free jobs in functions/src/schedules.ts (21 Oct 2026).
 */
export const RETIRED_FUNCTIONS = Object.freeze(['searchGifs', 'retryAccountDeletions', 'retryAvatarDeletions', 'retryRemovedMedia',
  'expireScheduledNotes', 'cleanupPostMedia', 'reconcilePostCounters', 'reconcileNoteDensity']);

/** Retired functions still deployed in the region, from `firebase functions:list --json` output. */
export function retiredFunctionsToDelete(listOutput, retired = RETIRED_FUNCTIONS, exported = []) {
  let listed;
  try { listed = JSON.parse(String(listOutput ?? '')); } catch { listed = null; }
  if (!Array.isArray(listed?.result)) throw new Error('Firebase functions:list returned no function inventory; retired functions were not checked.');
  const deployed = new Set(listed.result.filter(fn => fn?.region === REGION).map(fn => fn.id));
  // A name exported again from functions/src is live code, never something to delete.
  return retired.filter(name => deployed.has(name) && !exported.includes(name));
}

/** Bound startup/deploy pressure without changing CPU, regions or the security contract. */
export function functionDeploymentBatches(root = REPOSITORY_ROOT, size = 1) {
  if (!Number.isInteger(size) || size < 1 || size > 10) throw new Error('Function batches must contain 1 to 10 functions.');
  const source = readFileSync(path.join(root, 'functions/src/index.ts'), 'utf8');
  const names = [...new Set([...source.matchAll(/export\s*\{([^}]+)\}\s*from/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim().split(/\s+as\s+/).at(-1)).filter(Boolean)))];
  if (!names.length || names.some(name => !/^[A-Za-z_$][\w$]*$/.test(name))) throw new Error('Function export inventory could not be derived.');
  return Array.from({ length: Math.ceil(names.length / size) }, (_, i) => names.slice(i * size, (i + 1) * size));
}

export function deploymentEnvironment(env = process.env, alias) {
  if (['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FUNCTIONS_EMULATOR'].some(name => env[name])) throw new Error('Emulator selectors must not be present during a production deployment.');
  const result = { ...env };
  if (env.OIC_MANIFEST_PATH) {
    const manifest = JSON.parse(readFileSync(env.OIC_MANIFEST_PATH, 'utf8'));
    const matches = manifest.connections?.filter(connection => connection.provider_kind === 'gcp' && (!alias || connection.alias === alias)) ?? [];
    if (manifest.version !== 1 || matches.length !== 1) throw new Error('Select one authorized managed GCP connection in environment settings.');
    for (const [variable, field] of [['CLOUDSDK_CONFIG', 'config_dir'], ['CLOUDSDK_ACTIVE_CONFIG_NAME', 'configuration_name'], ['GOOGLE_APPLICATION_CREDENTIALS', 'credentials_file']]) {
      if (typeof matches[0][field] !== 'string' || !matches[0][field]) throw new Error('Managed GCP connection selector metadata is incomplete.');
      result[variable] = matches[0][field];
    }
  } else if (alias) throw new Error('--gcp-alias requires a managed GCP connection manifest.');
  return result;
}

/** Interrupted-run marker: a double-clicked rerun on the same commit continues where the last run stopped. */
export const RESUME_FILE = '.firebase-deploy-resume.json';

export function savedResume(root, head) {
  const file = path.join(root, RESUME_FILE);
  if (!existsSync(file)) return undefined;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    return saved.head === head && typeof saved.function === 'string' ? saved.function : undefined;
  } catch { return undefined; }
}

function currentHead(root, runner) {
  const head = runner('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const dirty = runner('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
  if (head.status !== 0 || dirty.status !== 0 || String(dirty.stdout ?? '').trim()) return undefined;
  return String(head.stdout ?? '').trim() || undefined;
}

const pause = seconds => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000); };

/**
 * resumeFrom continues an interrupted run at that function: the rules and earlier functions are already
 * live, so they are not redeployed. The local checks still run first. A failed function deploy is retried
 * once after 30 s, because single Firebase API requests fail transiently during long sequential deploys.
 */
export function deploy({ dryRun = false, planOnly = false, alias, resumeFrom, resumeHead, runner = spawnSync, validate = preflight, env = process.env, root = REPOSITORY_ROOT, sleep = pause } = {}) {
  const batches = functionDeploymentBatches(root);
  const start = resumeFrom === undefined ? 0 : batches.findIndex(batch => batch.includes(resumeFrom));
  if (start < 0) throw new Error('Unknown function for --resume-from: ' + resumeFrom);
  validate({ planOnly, runner, root, env });
  if (planOnly) { console.log('Plan only: checks and deployment were not run.'); return; }
  if (dryRun) { console.log('Dry run: all local checks passed; no live authentication or deployment was attempted.'); return; }
  const selectedEnv = deploymentEnvironment(env, alias);
  const command = path.join(root, 'functions/node_modules/.bin/firebase');
  const run = (args, options = { stdio: 'inherit' }) => {
    const result = runner(command, args, { cwd: root, env: selectedEnv, ...options });
    if (result.error || result.status !== 0) {
      const error = new Error('Firebase ' + args[0] + ' failed; inspect the reported permission or configuration error.');
      error.exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
      throw error;
    }
    return result;
  };
  const head = resumeHead;
  run(['apps:list', '--project', PROJECT, '--non-interactive']);
  if (start === 0) run(['deploy', '--only', 'firestore,storage', '--project', PROJECT, '--non-interactive']);
  for (const batch of batches.slice(start)) {
    const args = ['deploy', '--only', batch.map(name => 'functions:' + name).join(','), '--project', PROJECT, '--non-interactive'];
    try { run(args); } catch {
      console.error('Retrying ' + batch.join(', ') + ' once in 30 s.');
      sleep(30);
      try { run(args); } catch (error) {
        if (head) writeFileSync(path.join(root, RESUME_FILE), JSON.stringify({ head, function: batch[0] }) + '\n');
        error.message += ' Running scripts/firebase-deploy.command again on this commit continues from ' + batch[0] +
          ' (or pass --resume-from=' + batch[0] + ').';
        throw error;
      }
    }
  }
  // Only after every current function is live: remove the retired ones (and with them their Scheduler jobs).
  const listed = run(['functions:list', '--project', PROJECT, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const retired = retiredFunctionsToDelete(listed.stdout, RETIRED_FUNCTIONS, batches.flat());
  if (retired.length) run(['functions:delete', ...retired, '--region', REGION, '--project', PROJECT, '--force', '--non-interactive']);
  if (head) rmSync(path.join(root, RESUME_FILE), { force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const aliasFlag = args.find(arg => arg.startsWith('--gcp-alias='));
    const resumeFlag = args.find(arg => arg.startsWith('--resume-from='));
    if (args.some(arg => !['--dry-run', '--plan'].includes(arg) && arg !== aliasFlag && arg !== resumeFlag)) throw new Error('Usage: bash scripts/firebase-deploy.command [--dry-run|--plan] [--gcp-alias=alias] [--resume-from=functionName]');
    if (args.includes('--plan')) for (const step of preflight({ planOnly: true })) console.log(step.label + ': ' + JSON.stringify([step.command, ...step.args]));
    const live = !args.includes('--dry-run') && !args.includes('--plan');
    const head = live ? currentHead(REPOSITORY_ROOT, spawnSync) : undefined;
    let resumeFrom = resumeFlag?.slice('--resume-from='.length);
    if (live && resumeFrom === undefined && head) {
      resumeFrom = savedResume(REPOSITORY_ROOT, head);
      if (resumeFrom) console.log('Continuing the interrupted deploy of this commit from ' + resumeFrom + ' (rules and earlier functions are live).');
    }
    deploy({ dryRun: !live && args.includes('--dry-run'), planOnly: args.includes('--plan'), alias: aliasFlag?.slice('--gcp-alias='.length), resumeFrom, resumeHead: head });
  } catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
