import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preflight, REPOSITORY_ROOT } from './release-preflight.mjs';

export const PROJECT = 'lociar-2f38c';

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

export function deploy({ dryRun = false, planOnly = false, alias, runner = spawnSync, validate = preflight, env = process.env, root = REPOSITORY_ROOT } = {}) {
  validate({ planOnly, runner, root, env });
  if (planOnly) { console.log('Plan only: checks and deployment were not run.'); return; }
  if (dryRun) { console.log('Dry run: all local checks passed; no live authentication or deployment was attempted.'); return; }
  const selectedEnv = deploymentEnvironment(env, alias);
  const command = path.join(root, 'functions/node_modules/.bin/firebase');
  for (const args of [
    ['apps:list', '--project', PROJECT, '--non-interactive'],
    ['deploy', '--only', 'firestore,storage,functions', '--project', PROJECT, '--non-interactive'],
  ]) {
    const result = runner(command, args, { cwd: root, env: selectedEnv, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      const error = new Error('Firebase ' + args[0] + ' failed; inspect the reported permission or configuration error.');
      error.exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
      throw error;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const aliasFlag = args.find(arg => arg.startsWith('--gcp-alias='));
    if (args.some(arg => !['--dry-run', '--plan'].includes(arg) && arg !== aliasFlag)) throw new Error('Usage: bash scripts/firebase-deploy.command [--dry-run|--plan] [--gcp-alias=alias]');
    if (args.includes('--plan')) for (const step of preflight({ planOnly: true })) console.log(step.label + ': ' + JSON.stringify([step.command, ...step.args]));
    deploy({ dryRun: args.includes('--dry-run'), planOnly: args.includes('--plan'), alias: aliasFlag?.slice('--gcp-alias='.length) });
  } catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
