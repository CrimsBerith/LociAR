#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Absolute path: never resolve developer tools through a writable PATH entry.
const XCRUN = '/usr/bin/xcrun';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);

const DEVICES = [
  {
    key: 'SE3',
    name: 'iPhone SE (3rd gen)',
    simName: 'LociAR Notes - SE3',
    udid: '6BD54E3D-48B7-4C60-8181-9BC54518EBA7',
    formFactor: '4.7" Home Button (16:9)',
    focus: 'Home button layout, keyboard handling, no-notch safe area',
  },
  {
    key: '13mini',
    name: 'iPhone 13 mini',
    simName: 'LociAR Notes - 13mini',
    udid: 'D0F0B908-4F0F-4979-AC57-EB7F70A7AAAC',
    formFactor: '5.4" Compact Notch',
    focus: 'Compact notch margins, 6m map cluster, compact TabBar safe area',
  },
  {
    key: '14',
    name: 'iPhone 14',
    simName: 'LociAR Notes - 14',
    udid: '9054EFCE-A4BD-4656-B78B-B5BDC81B6B5B',
    formFactor: '6.1" Standard Notch',
    focus: 'Standard modern notch reference baseline, full user flow',
  },
  {
    key: '14Plus',
    name: 'iPhone 14 Plus',
    simName: 'LociAR Notes - 14Plus',
    udid: 'A9C46942-5310-453F-9061-2968DC5FA32A',
    formFactor: '6.7" Large Notch',
    focus: 'Large screen layout, high density note listing, horizontal margins',
  },
  {
    key: '14Pro',
    name: 'iPhone 14 Pro',
    simName: 'LociAR Notes - 14Pro',
    udid: '445874CC-6658-48E8-93A5-9A9498A17357',
    formFactor: '6.1" Dynamic Island',
    focus: 'Dynamic Island avoidance, top navigation header, safe area padding',
  },
];

const TARGET_TESTS = [
  'testEmulator01SignUpVerifyAndSignIn',
  'testEmulator02CameraFreeNotePublishesAndAppearsWithoutManualRefresh',
  'testEmulator02dMapGroupRequiresOnSiteFixAndRanksAllNotes',
  'testEmulator03BrowseTabsAndEditProfile',
  'testEmulator04NotificationConsentPersistsWithoutMarketingOrLocationSharing',
];

function runSimctl(...args) {
  try {
    return execFileSync(XCRUN, ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

function ensureNoSimulatorsBooted() {
  const output = runSimctl('list', 'devices');
  const bootedLines = output.split('\n').filter(l => l.includes('(Booted)'));
  if (bootedLines.length > 0) {
    console.log(`[Matrix] Shutting down ${bootedLines.length} active simulator(s)...`);
    for (const line of bootedLines) {
      const match = line.match(/\(([A-F0-9-]{36})\)/);
      if (match) {
        console.log(`[Matrix] Shutting down ${match[1]}...`);
        runSimctl('shutdown', match[1]);
      }
    }
  }
}

function exportXcresultAttachments(xcresultPath, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  try {
    execFileSync(XCRUN, [
      'xcresulttool', 'export', 'attachments',
      '--path', xcresultPath,
      '--output-path', outputDir,
    ], { stdio: 'inherit' });
  } catch (err) {
    console.warn(`[Matrix] Failed exporting attachments from ${xcresultPath}: ${err.message}`);
  }
}

async function runDevice(device, index, total) {
  const baseOutputDir = resolve(root, 'build/master-device-testing-20261031', device.key);
  const summaryFile = join(baseOutputDir, 'device-summary.json');

  if (process.env.FORCE_RERUN !== '1' && existsSync(summaryFile)) {
    try {
      const existing = JSON.parse(readFileSync(summaryFile, 'utf8'));
      if (existing.success && existing.passedTests?.length === TARGET_TESTS.length) {
        console.log(`\n[Matrix] [${index + 1}/${total}] SKIPPING ${device.name} (${device.key}) - Already PASSED 100% (${existing.durationSec}s).`);
        return existing;
      }
    } catch {}
  }

  console.log(`\n======================================================================`);
  console.log(`[Matrix] [${index + 1}/${total}] STARTING DEVICE: ${device.name} (${device.key})`);
  console.log(`[Matrix] UDID: ${device.udid}`);
  console.log(`[Matrix] Form Factor: ${device.formFactor}`);
  console.log(`[Matrix] Focus: ${device.focus}`);
  console.log(`======================================================================\n`);

  ensureNoSimulatorsBooted();
  // run-simulator-notes.mjs uses 'wx' flag when creating log files. The output dir must be fresh.
  if (existsSync(baseOutputDir)) {
    rmSync(baseOutputDir, { recursive: true, force: true });
  }
  mkdirSync(baseOutputDir, { recursive: true });

  const env = {
    ...process.env,
    PATH: `/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:${process.env.PATH || ''}`,
    JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    LOCIAR_TEST_SIMULATOR: device.udid,
    LOCIAR_TEST_OUTPUT: baseOutputDir,
    LOCIAR_TEST_DERIVED_DATA: '/Users/khankartal/Library/Developer/Xcode/DerivedData/LociAR-bwrwirqnhlpcaufcrvegqbhlrzrz',
    LOCIAR_SIMULATOR_TESTS: TARGET_TESTS.join(','),
  };

  const startTime = Date.now();
  const runResult = spawnSync(process.execPath, ['scripts/run-simulator-notes.mjs'], {
    env,
    stdio: 'inherit',
    cwd: root,
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const success = runResult.status === 0;

  console.log(`\n[Matrix] Device ${device.name} run finished in ${durationSec}s with exit code ${runResult.status}`);

  // Export all attachments from each test xcresult
  const attachmentsDir = join(baseOutputDir, 'attachments');
  mkdirSync(attachmentsDir, { recursive: true });

  for (const testName of TARGET_TESTS) {
    const xcresult = join(baseOutputDir, `${testName}.xcresult`);
    if (existsSync(xcresult)) {
      const testAttachmentDir = join(attachmentsDir, testName);
      exportXcresultAttachments(xcresult, testAttachmentDir);
    }
  }

  // Shutdown and clean up simulator to enforce single simulator constraint
  console.log(`[Matrix] Shutting down and erasing ${device.name}...`);
  runSimctl('shutdown', device.udid);
  runSimctl('erase', device.udid);

  ensureNoSimulatorsBooted();

  // Read accepted / failed state
  let accepted = [], failed = [];
  try {
    const accFile = join(baseOutputDir, 'accepted.json');
    if (existsSync(accFile)) accepted = JSON.parse(readFileSync(accFile, 'utf8'));
  } catch {}
  try {
    const failFile = join(baseOutputDir, 'failed.json');
    if (existsSync(failFile)) failed = JSON.parse(readFileSync(failFile, 'utf8'));
  } catch {}

  const deviceSummary = {
    key: device.key,
    name: device.name,
    formFactor: device.formFactor,
    udid: device.udid,
    durationSec,
    success,
    passedTests: accepted,
    failedTests: failed,
    totalTargetTests: TARGET_TESTS.length,
  };

  writeFileSync(join(baseOutputDir, 'device-summary.json'), JSON.stringify(deviceSummary, null, 2));
  return deviceSummary;
}

async function main() {
  const onlyDevice = process.env.ONLY_DEVICE;
  const targetDevices = onlyDevice
    ? DEVICES.filter(d => d.key.toLowerCase() === onlyDevice.toLowerCase())
    : DEVICES;

  if (targetDevices.length === 0) {
    console.error(`Unknown ONLY_DEVICE: ${onlyDevice}. Available: ${DEVICES.map(d => d.key).join(', ')}`);
    process.exit(1);
  }

  console.log(`[Matrix] Master Device Testing Matrix Starting.`);
  console.log(`[Matrix] Devices to test: ${targetDevices.map(d => d.key).join(', ')}`);
  console.log(`[Matrix] Suite per device: ${TARGET_TESTS.join(', ')}`);
  console.log(`[Matrix] Single active simulator strictly enforced.\n`);

  const results = [];
  for (let i = 0; i < targetDevices.length; i++) {
    const res = await runDevice(targetDevices[i], i, targetDevices.length);
    results.push(res);
  }

  const matrixSummaryPath = resolve(root, 'build/master-device-testing-20261031/matrix-summary.json');
  writeFileSync(matrixSummaryPath, JSON.stringify(results, null, 2));

  console.log(`\n======================================================================`);
  console.log(`[Matrix] ALL DEVICES COMPLETED`);
  console.log(`======================================================================`);
  for (const r of results) {
    console.log(`  * ${r.name.padEnd(25)} | ${r.formFactor.padEnd(25)} | ${r.success ? 'PASS' : 'FAIL'} | Passed: ${r.passedTests.length}/${r.totalTargetTests} | ${r.durationSec}s`);
  }
  console.log(`======================================================================\n`);

  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('[Matrix] Fatal error:', err);
  ensureNoSimulatorsBooted();
  process.exit(1);
});
