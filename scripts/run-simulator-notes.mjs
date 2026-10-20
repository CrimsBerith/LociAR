import { forEachSequential, pollUntil } from './async.mjs';
// Disposable Firebase + real iOS SDK/UI tests. No production config edits or deployment.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdirSync, mkdtempSync, cpSync, copyFileSync, symlinkSync, readFileSync, writeFileSync, openSync, closeSync, readdirSync, constants } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { randomBytes, generateKeyPairSync, createHash } from 'node:crypto';

assert.equal(Number(process.versions.node.split('.')[0]), 22, 'Select Node 22 in PATH.');
const root = resolve(import.meta.dirname, '..'); process.chdir(root);
const output = resolve(process.env.LOCIAR_TEST_OUTPUT ?? 'build/simulator-note-e2e');
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'runner.pid'), String(process.pid));
const env = { ...process.env, GCLOUD_PROJECT: 'demo-lociar', GOOGLE_CLOUD_PROJECT: 'demo-lociar', FUNCTIONS_EMULATOR: 'true',
  FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-lociar', storageBucket: 'demo-lociar.firebasestorage.app' }),
  FIREBASE_STORAGE_BUCKET: 'demo-lociar.firebasestorage.app',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' };
delete env.GOOGLE_APPLICATION_CREDENTIALS; delete env.FIREBASE_TOKEN;
delete env.FIREBASE_SERVICE_ACCOUNT_JSON;
const sim = process.env.LOCIAR_TEST_SIMULATOR;
assert.match(sim ?? '', /^[A-F0-9-]{36}$/i, 'Choose a dedicated LociAR Notes simulator.');
env.LOCIAR_TEST_SIMULATOR = sim; env.LOCIAR_TEST_OUTPUT = output;
const children = [];
let stopping = false;
let simulatorHTTPEnvironmentChanged = false, previousSimulatorHTTPEnvironment = null;
const command = (file, args) => spawnSync(file, args, { cwd: root, env, encoding: 'utf8' });
async function run(file, args, name) {
  assert.equal(stopping, false, 'The simulator run is stopping.');
  const fd = openSync(join(output, name + '.log'), 'wx', 0o600);
  const child = spawn(file, args, { cwd: root, env, stdio: ['ignore', fd, fd] });
  children.push(child); closeSync(fd);
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  assert.equal(code, 0, name + ' failed; inspect its log.');
  return readFileSync(join(output, name + '.log'), 'utf8');
}
function start(file, args, name) {
  assert.equal(stopping, false, 'The simulator run is stopping.');
  const fd = openSync(join(output, name + '.log'), 'wx', 0o600);
  const child = spawn(file, args, { cwd: root, env, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); children.push(child); return child;
}
async function listening(port) {
  return new Promise(accept => { const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(300); socket.once('connect', () => { socket.destroy(); accept(true); });
    socket.once('error', () => accept(false)); socket.once('timeout', () => { socket.destroy(); accept(false); }); });
}
async function stop() {
  stopping = true;
  const active = children.toReversed().filter(child => child.exitCode == null && child.signalCode == null);
  for (const child of active) {
    try { if (child.spawnargs[0] === process.execPath && child.spawnargs.includes('emulators:start')) process.kill(-child.pid, 'SIGINT');
      else if (child.spawnargs.includes('scripts/simulator-note-fixture.mjs')) process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGINT'); } catch {}
  }
  await Promise.all(active.map(child => new Promise(accept => {
    if (child.exitCode != null || child.signalCode != null) { accept(); return; }
    const timer = setTimeout(accept, 10_000);
    child.once('exit', () => { clearTimeout(timer); accept(); });
  })));
  if (simulatorHTTPEnvironmentChanged) {
    const args = previousSimulatorHTTPEnvironment == null
      ? ['unsetenv', 'LOCIAR_DEMO_EMULATOR_HTTP']
      : ['setenv', 'LOCIAR_DEMO_EMULATOR_HTTP', previousSimulatorHTTPEnvironment];
    assert.equal(command('xcrun', ['simctl', 'spawn', sim, 'launchctl', ...args]).status, 0, 'Could not restore the dedicated simulator environment.');
    simulatorHTTPEnvironmentChanged = false;
  }
}
process.once('SIGINT', async () => { await stop(); process.exit(130); });
process.once('SIGTERM', async () => { await stop(); process.exit(143); });
try {
  await Promise.all([9099, 8080, 9199, 5001, 4400, 4500, 9150, 9867].map(async port => {
    assert.equal(await listening(port), false, `Port ${port} is occupied.`);
  }));
  const inventory = command('xcrun', ['simctl', 'list', 'devices', '-j']);
  assert.equal(inventory.status, 0);
  const device = Object.values(JSON.parse(inventory.stdout).devices).flat().find(d => d.udid === sim && d.name.startsWith('LociAR Notes'));
  assert.ok(device,
    'Use a dedicated LociAR Notes simulator; its test keychain will be reset.');
  if (device.state === 'Shutdown') assert.equal(command('xcrun', ['simctl', 'boot', sim]).status, 0);
  await run('xcrun', ['simctl', 'bootstatus', sim, '-b'], 'simulator-boot');
  command('xcrun', ['simctl', 'terminate', sim, 'com.khankartal.lociar']);
  assert.equal(command('xcrun', ['simctl', 'keychain', sim, 'reset']).status, 0);
  // SpringBoard launches do not inherit XCUIApplication.launchEnvironment.
  // Opt in only on this dedicated simulator, then restore its prior value in stop().
  const inherited = command('xcrun', ['simctl', 'spawn', sim, 'launchctl', 'getenv', 'LOCIAR_DEMO_EMULATOR_HTTP']);
  previousSimulatorHTTPEnvironment = inherited.status === 0 && inherited.stdout.trim() ? inherited.stdout.trim() : null;
  assert.equal(command('xcrun', ['simctl', 'spawn', sim, 'launchctl', 'setenv', 'LOCIAR_DEMO_EMULATOR_HTTP', '1']).status, 0);
  simulatorHTTPEnvironmentChanged = true;
  const java = command('java', ['-version']);
  assert.ok(java.status === 0 && Number(/version "(\d+)/.exec(java.stderr + java.stdout)?.[1]) >= 21, 'Java 21 is required.');
  let host;
  for (const iface of ['en0', 'en1']) {
    const result = command('ipconfig', ['getifaddr', iface]);
    if (result.status === 0) { host = result.stdout.trim(); break; }
  }
  assert.match(host ?? '', /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/, 'A private LAN address is required for credentialed demo HTTP.');
  await run('npm', ['--prefix', 'functions', 'run', 'build'], 'functions-build');
  const frozen = mkdtempSync(join(output, 'backend-'));
  cpSync('functions/lib', join(frozen, 'lib'), { recursive: true });
  copyFileSync('functions/package.json', join(frozen, 'package.json'));
  symlinkSync(resolve('functions/node_modules'), join(frozen, 'node_modules'));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  writeFileSync(join(frozen, '.secret.local'), Object.entries({ APPLE_PRIVATE_KEY: privateKey, GIPHY_API_KEY: 'fake-api-key' })
    .map(([name, value]) => name + '=' + JSON.stringify(value)).join('\n') + '\n', { mode: 0o600 });
  writeFileSync(join(frozen, '.env.demo-lociar'), 'APPLE_TEAM_ID=EMULATOR\nAPPLE_KEY_ID=EMULATOR\nAPPLE_CLIENT_ID=com.khankartal.lociar\nAPPLE_AUTH_BASE_URL=http://127.0.0.1:1\nGIPHY_API_BASE_URL=http://127.0.0.1:1\n', { mode: 0o600 });
  const config = JSON.parse(readFileSync('firebase.json'));
  config.firestore.rules = resolve('firestore.rules'); config.firestore.indexes = resolve('firestore.indexes.json'); config.storage.rules = resolve('storage.rules');
  config.functions = [{ source: relative(output, frozen), codebase: 'default', runtime: 'nodejs22' }];
  const configFile = join(output, 'firebase.json'); writeFileSync(configFile, JSON.stringify(config));
  const backend = start(process.execPath, [resolve('functions/node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--project', 'demo-lociar', '--config', configFile, '--only', 'auth,firestore,storage,functions'], 'emulators');
  await pollUntil(async () => {
    assert.ok(backend.exitCode == null, 'Demo backend did not start.');
    try {
      const response = await fetch('http://127.0.0.1:5001/demo-lociar/us-central1/createPlaceNote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}' });
      return response.status === 401 && await listening(9099);
    } catch { return false; }
  }, Boolean, 150, 1000, 'Demo backend did not start.');
  env.E2E_EMAIL = 'simulator-' + randomBytes(8).toString('hex') + '@lociar.test';
  env.TEST_RUNNER_E2E_EMAIL = env.E2E_EMAIL;
  env.TEST_RUNNER_E2E_PASSWORD = randomBytes(24).toString('hex');
  env.TEST_RUNNER_E2E_DEMO_EMULATOR_HTTP = '1'; env.TEST_RUNNER_E2E_FIXTURE_URL = 'http://127.0.0.1:9867';
  start(process.execPath, ['--conditions=react-server', '--import', './admin/tests/register-typescript.mjs', 'scripts/simulator-note-fixture.mjs'], 'fixture');
  await pollUntil(() => listening(9867), Boolean, 21, 500, 'Fixture server did not start.');
  const derivedData = resolve(process.env.LOCIAR_TEST_DERIVED_DATA ?? join(output, 'DerivedData'));
  const common = ['-project', 'LociAR.xcodeproj', '-scheme', 'LociAR', '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id=' + sim,
    '-derivedDataPath', derivedData,
    '-clonedSourcePackagesDirPath', resolve('build/ci-ios/SourcePackages'), '-disableAutomaticPackageResolution', '-onlyUsePackageVersionsFromResolvedFile',
    '-parallel-testing-enabled', 'NO', 'LOCIAR_EMULATOR_HOST=' + host, 'LOCIAR_FIREBASE_PROJECT_ID=demo-lociar',
    'LOCIAR_FIREBASE_STORAGE_BUCKET=demo-lociar.firebasestorage.app', 'LOCIAR_FIREBASE_API_KEY=AIza' + 'A'.repeat(35),
    'LOCIAR_FIREBASE_GOOGLE_APP_ID=1:123456789012:ios:abcdef0123456789', 'LOCIAR_FIREBASE_GCM_SENDER_ID=123456789012'];
  await run('xcodebuild', [...common, 'build-for-testing'], 'build');
  // Each invocation installs its target app again. Never read mutable shared
  // DerivedData here: a different simulator build can change signing/keychain access.
  const products = join(output, 'Products');
  cpSync(join(derivedData, 'Build/Products'), products, { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  const manifests = readdirSync(products).filter(name => name.startsWith('LociAR_') && name.endsWith('.xctestrun'));
  assert.equal(manifests.length, 1);
  const testCommon = ['-xctestrun', join(products, manifests[0]), '-destination', 'platform=iOS Simulator,id=' + sim,
    '-parallel-testing-enabled', 'NO'];
  const appFiles = ['Debug-iphonesimulator/LociAR.app/Info.plist', 'Debug-iphonesimulator/LociAR.app/LociAR'];
  const artifactHashes = () => Object.fromEntries(appFiles.map(file => [file, createHash('sha256').update(readFileSync(join(products, file))).digest('hex')]));
  const frozenHashes = artifactHashes();
  writeFileSync(join(output, 'app-artifact-start.json'), JSON.stringify(frozenHashes, null, 2));
  await run('xcodebuild', [...testCommon, '-only-testing:LociARTests',
    '-resultBundlePath', join(output, 'native-tests.xcresult'), 'test-without-building'], 'native-tests');
  const nativeResult = command('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', join(output, 'native-tests.xcresult')]);
  assert.equal(nativeResult.status, 0);
  const nativeSummary = JSON.parse(nativeResult.stdout);
  const nativeTree = command('xcrun', ['xcresulttool', 'get', 'test-results', 'tests', '--path', join(output, 'native-tests.xcresult')]);
  assert.equal(nativeTree.status, 0);
  const physicalOnly = new Set(['ArrivalRuntimeTests/testPhysicalCameraFramesResumeAcrossNewPinSessions()',
    'ArrivalRuntimeTests/testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements()']);
  const skipped = [];
  function collectSkipped(value) {
    if (Array.isArray(value)) value.forEach(collectSkipped);
    else if (value && typeof value === 'object') {
      if (value.nodeType === 'Test Case' && value.result === 'Skipped') skipped.push(value.nodeIdentifier);
      Object.values(value).forEach(collectSkipped);
    }
  }
  collectSkipped(JSON.parse(nativeTree.stdout));
  assert.ok(nativeSummary.passedTests > 0 && nativeSummary.failedTests === 0
    && skipped.length === nativeSummary.skippedTests && skipped.every(id => physicalOnly.has(id))
    && nativeSummary.totalTestCount === nativeSummary.passedTests + nativeSummary.skippedTests, 'Incomplete native test evidence.');
  writeFileSync(join(output, 'native-summary.json'), JSON.stringify(nativeSummary, null, 2));
  const allTests = ['testEmulator01SignUpVerifyAndSignIn', 'testEmulator02CameraFreeNotePublishesAndAppearsWithoutManualRefresh',
    'testEmulator02bMissingFixDoesNotPublishAndFreshFixAllowsRetry',
    'testEmulator02cFilteredTextIsLocalizedAndRetryPublishes',
    'testEmulator02dMapGroupRequiresOnSiteFixAndRanksAllNotes',
    'testEmulator03BrowseTabsAndEditProfile', 'testEmulator04NotificationConsentPersistsWithoutMarketingOrLocationSharing',
    'testEmulator05SignOutAndBackIn', 'testEmulator06LocationEntryQueuesOneNotificationAndOpensTheNote',
    'testEmulator07AdminNotificationOpensActivityWithMarketingOff', 'testEmulator07bAdminNotificationColdLaunchOpensActivity',
    'testEmulator07cForeignRecipientCannotPresentOrNavigate', 'testEmulator07dForegroundAdminNotificationOpensActivity',
    'testEmulator08NotificationsOffPreventsAdminQueue',
    'testEmulator08bDeniedLocationBlocksPublishingAndRecovers', 'testEmulator09DeleteAccount'];
  const tests = process.env.LOCIAR_SIMULATOR_TESTS ? process.env.LOCIAR_SIMULATOR_TESTS.split(',') : allTests;
  assert.equal(tests[0], allTests[0], 'Every selection must establish a real SDK session first.');
  assert.ok(tests.every(name => allTests.includes(name)));
  const accepted = [], failed = [];
  await forEachSequential(tests, async name => {
    if (name === tests[1]) assert.equal(command('xcrun', ['simctl', 'privacy', sim, 'grant', 'location-always', 'com.khankartal.lociar']).status, 0);
    console.log('RUN ' + name);
    try {
      const log = await run('xcodebuild', [...testCommon, '-only-testing:LociARUITests/AuthGateUITests/' + name,
        '-resultBundlePath', join(output, name + '.xcresult'), 'test-without-building'], name);
      assert.match(log, new RegExp("Test Case .*" + name + ".* passed"), name + ' did not pass (skip is not acceptance).');
      accepted.push(name); writeFileSync(join(output, 'accepted.json'), JSON.stringify(accepted, null, 2));
      console.log('PASS ' + name);
    } catch (error) {
      if (stopping) throw error;
      failed.push(name); writeFileSync(join(output, 'failed.json'), JSON.stringify(failed, null, 2));
      console.error('FAIL ' + name);
      if (name === tests[0]) throw error; // Later workflows require this real SDK session.
    }
  });
  const finalHashes = artifactHashes();
  writeFileSync(join(output, 'app-artifact-end.json'), JSON.stringify(finalHashes, null, 2));
  assert.deepEqual(finalHashes, frozenHashes, 'The installed app artifact changed during acceptance.');
  assert.equal(failed.length, 0, 'Simulator scenarios failed: ' + failed.join(', '));
} finally { await stop(); }
