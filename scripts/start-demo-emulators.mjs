import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync, cpSync, copyFileSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
if (process.argv.includes('--check')) {
  console.log('demo-lociar; synthetic credentials; no Local.xcconfig edits; no existing-process termination');
  process.exit(0);
}
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Select Node 22 in PATH.');
const env = { ...process.env };
const jdk = ['/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'].find(existsSync);
if (jdk) { env.JAVA_HOME = jdk; env.PATH = join(jdk, 'bin') + ':' + env.PATH; }
const run = (name, args, options = {}) => spawnSync('rtk', ['proxy', name, ...args], { env, encoding: 'utf8', ...options });
let host = process.env.LOCIAR_TEST_LAN_IP;
for (const iface of ['en0', 'en1']) {
  if (host) break;
  const r = run('ipconfig', ['getifaddr', iface]);
  if (r.status === 0) host = r.stdout.trim();
}
const ip = host?.split('.').map(Number);
if (!ip || ip.length !== 4 || ip.some(n => !Number.isInteger(n) || n < 0 || n > 255) || ip.map(String).join('.') !== host
    || !(ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168))) {
  throw new Error('Set LOCIAR_TEST_LAN_IP to a private LAN IPv4 address.');
}
for (const port of [9099, 8080, 9199, 5001, 4400, 4500, 9150]) {
  const r = run('lsof', ['-t', '-nP', '-iTCP:' + port, '-sTCP:LISTEN']);
  if (r.status === 0 && r.stdout.trim()) throw new Error('Port ' + port + ' is occupied; stop its owner before starting.');
  if (r.status !== 0 && r.status !== 1) throw new Error('Could not inspect port ' + port + '.');
}
if (!existsSync('functions/node_modules/.bin/firebase')) throw new Error('Install Functions dependencies with Node 22 first.');
if (run('java', ['-version']).status !== 0) throw new Error('Java 21 is required.');
if (run('npm', ['run', 'build'], { cwd: resolve('functions'), stdio: 'inherit' }).status !== 0) throw new Error('Functions build failed.');
mkdirSync('scripts/.e2e', { recursive: true });
const out = mkdtempSync(resolve('scripts/.e2e/manual-demo-'));
const frozen = join(out, 'functions'); mkdirSync(frozen);
cpSync('functions/lib', join(frozen, 'lib'), { recursive: true });
copyFileSync('functions/package.json', join(frozen, 'package.json'));
symlinkSync(resolve('functions/node_modules'), join(frozen, 'node_modules'));
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const demoSecrets = { APPLE_PRIVATE_KEY: privateKey, GIPHY_API_KEY: 'fake-api-key' };
writeFileSync(join(frozen, '.secret.local'), Object.entries(demoSecrets)
  .map(([name, value]) => name + '=' + JSON.stringify(value)).join('\n') + '\n', { mode: 0o600 });
writeFileSync(join(frozen, '.env.demo-lociar'), 'APPLE_TEAM_ID=EMULATOR\nAPPLE_KEY_ID=EMULATOR\nAPPLE_CLIENT_ID=com.khankartal.lociar\nAPPLE_AUTH_BASE_URL=http://127.0.0.1:1\nGIPHY_API_BASE_URL=http://127.0.0.1:1\n', { mode: 0o600 });
const config = JSON.parse(readFileSync('firebase.json'));
config.firestore.rules = resolve('firestore.rules'); config.firestore.indexes = resolve('firestore.indexes.json'); config.storage.rules = resolve('storage.rules');
config.functions = [{ source: 'functions', codebase: 'default', runtime: 'nodejs22' }];
for (const value of Object.values(config.emulators)) if (value && typeof value === 'object' && 'host' in value) value.host = host;
const configFile = join(out, 'firebase.json'); writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
writeFileSync('scripts/.emulator-host.txt', host + '\n', { mode: 0o600 });
console.log('Disposable demo backend: ' + out);
console.log('For the Debug iPhone build, pass these build settings:');
console.log(['LOCIAR_EMULATOR_HOST=' + host, 'LOCIAR_FIREBASE_PROJECT_ID=demo-lociar',
  'LOCIAR_FIREBASE_STORAGE_BUCKET=demo-lociar.firebasestorage.app', 'LOCIAR_FIREBASE_API_KEY=AIza' + 'A'.repeat(35),
  'LOCIAR_FIREBASE_GOOGLE_APP_ID=1:123456789012:ios:abcdef0123456789', 'LOCIAR_FIREBASE_GCM_SENDER_ID=123456789012'].join('\n'));
console.log('Set the app Run environment LOCIAR_DEMO_EMULATOR_HTTP=1. The phone and Mac must share Wi-Fi. Ctrl+C stops this backend.');
const child = spawn('rtk', ['proxy', resolve('functions/node_modules/.bin/firebase'), 'emulators:start', '--project', 'demo-lociar', '--config', configFile, '--only', 'auth,firestore,storage,functions'], { env, stdio: 'inherit' });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
const code = await new Promise(r => child.once('exit', r));
process.exitCode = code ?? 1;
