import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Firebase resolves every exported secret before filtering --only. A scoped entry
// point lets Stripe deploy without inventing credentials for optional providers.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'functions');
const names = ['supportStripeWebhook', 'supportCheckoutReturn', 'readSupportCatalog',
  'beginExternalPostSupport', 'readMyPostSupport', 'readMySupportEarnings', 'refreshStripePostSupport'];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyFlags = args.filter(arg => arg.startsWith('--only='));
const selected = onlyFlags.length ? onlyFlags[0].slice(7).split(',') : names;
if (onlyFlags.length > 1 || args.some(arg => arg !== '--dry-run' && !arg.startsWith('--only='))
    || selected.some(name => !names.includes(name)) || new Set(selected).size !== selected.length) {
  throw new Error('Usage: node functions/scripts/deploy-support-stripe.mjs [--dry-run] [--only=name,...]');
}
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node 22.');
if (['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FUNCTIONS_EMULATOR'].some(key => process.env[key])
    || (process.env.LOCIAR_FUNCTIONS_REGION && process.env.LOCIAR_FUNCTIONS_REGION !== 'us-central1')) {
  throw new Error('Deploy requires the production project environment and us-central1.');
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status ?? 'startup'}).`);
}
run('npm', ['--prefix', source, 'run', 'build']);
const staging = mkdtempSync(path.join(tmpdir(), 'lociar-stripe-deploy-'));
try {
  const functions = path.join(staging, 'functions');
  cpSync(path.join(source, 'lib'), path.join(functions, 'lib'), { recursive: true });
  cpSync(path.join(source, 'package-lock.json'), path.join(functions, 'package-lock.json'));
  const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  pkg.main = 'lib/index.js';
  pkg.scripts = { 'gcp-build': '' }; // Staged JavaScript was built and typechecked above.
  writeFileSync(path.join(functions, 'package.json'), JSON.stringify(pkg, null, 2));
  function writeEntry(names) { writeFileSync(path.join(functions, pkg.main),
    `console.info('lociar_support_boot', process.env.FUNCTION_TARGET || 'discovery');\n`
    + names.map(name => `exports.${name} = require('./${name === 'supportCheckoutReturn' ? 'supportReturn'
      : name.startsWith('readMy') ? 'supportReads' : 'supportStripe'}').${name};`).join('\n')
    + `\nconsole.info('lociar_support_module_ready');\n`); }
  const envFile = '.env.lociar-2f38c';
  if (existsSync(path.join(source, envFile))) cpSync(path.join(source, envFile), path.join(functions, envFile));
  symlinkSync(path.join(source, 'node_modules'), path.join(functions, 'node_modules'), 'dir');
  writeFileSync(path.join(staging, 'firebase.json'), JSON.stringify({ functions: [{
    source: 'functions', codebase: 'default', runtime: 'nodejs22',
    ignore: ['node_modules', '.*', '*.log', '*.credentials.json', '*.pem', '*.key', '*.p8', '*.p12'],
  }] }, null, 2));
  if (dryRun) { writeEntry(selected); console.log('Prepared Stripe-only deployment: ' + selected.join(', ')); }
  else for (const name of selected) {
    writeEntry([name]); // Do not initialize unrelated SDKs/secrets in an isolated function's cold start.
    run(path.join(source, 'node_modules/.bin/firebase'), ['deploy', '--only', `functions:${name}`,
      '--project', 'lociar-2f38c', '--config', path.join(staging, 'firebase.json'), '--non-interactive'], staging);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
