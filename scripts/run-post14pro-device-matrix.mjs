#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Absolute path: never resolve developer tools through a writable PATH entry.
const XCRUN = '/usr/bin/xcrun';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);

const DEVICES = [
  {
    key: '14ProMax',
    name: 'iPhone 14 Pro Max',
    simName: 'LociAR Notes - 14ProMax',
    udid: '02E3E2DC-D000-4DD1-BAE6-DDACE8928B4A',
    formFactor: '6.7" Dynamic Island',
    focus: 'Large screen Dynamic Island layout, high density content',
  },
  {
    key: '15',
    name: 'iPhone 15',
    simName: 'LociAR Notes - 15',
    udid: '3FCE7914-3B1B-4B94-8096-22349BF6FDE5',
    formFactor: '6.1" Dynamic Island (Base Model)',
    focus: 'Standard modern base model Dynamic Island baseline',
  },
  {
    key: '15Plus',
    name: 'iPhone 15 Plus',
    simName: 'LociAR Notes - 15Plus',
    udid: '3EEE6C04-ABF9-4962-9DB2-E4D0590BB20F',
    formFactor: '6.7" Dynamic Island (Base Plus)',
    focus: 'Base tier large display layout & touch margins',
  },
  {
    key: '15Pro',
    name: 'iPhone 15 Pro',
    simName: 'LociAR Notes - 15Pro',
    udid: '2FE43A6F-15A0-4B9E-A135-903428640F5D',
    formFactor: '6.1" Titanium Slim Bezel Dynamic Island',
    focus: 'Pro model 120Hz display simulation & safe area alignment',
  },
  {
    key: '15ProMax',
    name: 'iPhone 15 Pro Max',
    simName: 'LociAR Notes - 15ProMax',
    udid: '86FF9327-8159-4B6B-B834-2981B9A8DD9D',
    formFactor: '6.7" Titanium Slim Bezel Dynamic Island',
    focus: 'Slim bezel touch targets, 6m map cluster, edge-to-edge UI',
  },
  {
    key: '16e',
    name: 'iPhone 16e',
    simName: 'LociAR Notes - 16e',
    udid: 'EF9B9BB1-1135-4626-945F-DDDD897F7CC7',
    formFactor: '6.1" Modern Budget Dynamic Island',
    focus: 'Entry modern form factor UI stability & rendering',
  },
  {
    key: '16',
    name: 'iPhone 16',
    simName: 'LociAR Notes - 16',
    udid: '8E1573C4-7946-4027-B9DC-386B4EBDDD58',
    formFactor: '6.1" Modern Base Dynamic Island',
    focus: 'Latest generation 6.1" base model baseline',
  },
  {
    key: '16Plus',
    name: 'iPhone 16 Plus',
    simName: 'LociAR Notes - 16Plus',
    udid: '5E1E593A-04C1-4562-8F98-94CC7DABE7B5',
    formFactor: '6.7" Modern Base Plus Dynamic Island',
    focus: 'Latest generation 6.7" base plus layout validation',
  },
  {
    key: '16Pro',
    name: 'iPhone 16 Pro',
    simName: 'LociAR Notes - 16Pro',
    udid: 'BDCC312C-6CCC-4EE8-9425-3B41B067023B',
    formFactor: '6.3" Dynamic Island (New Aspect Ratio)',
    focus: 'New 6.3" screen aspect ratio, safe area adaptation',
  },
  {
    key: '16ProMax',
    name: 'iPhone 16 Pro Max',
    simName: 'LociAR Notes - 16ProMax',
    udid: '55BB3E40-0691-4366-9649-C03E4D29ADBA',
    formFactor: '6.9" Ultra Dynamic Island (Store Screenshot Spec)',
    focus: 'App Store Connect 6.9" screenshots (1320x2868) standard capture',
  },
  {
    key: 'Air',
    name: 'iPhone Air',
    simName: 'LociAR Notes - Air',
    udid: '129BDF5B-5948-401E-92BE-064056E9AF6E',
    formFactor: 'Ultra-Thin Profile Dynamic Island',
    focus: 'Ultra-thin form factor safe area & responsive navigation',
  },
  {
    key: 'Duo',
    name: 'iPhone Duo',
    simName: 'LociAR Notes - Duo',
    udid: '8F7B1913-CAFF-4860-914B-E7FF81C1A6C8',
    formFactor: 'Dual Screen / Foldable Dynamic Island',
    focus: 'Dual screen layout, multi-pane and fold hinge resilience',
  },
  {
    key: '17e',
    name: 'iPhone 17e',
    simName: 'LociAR Notes - 17e',
    udid: 'C3BCF936-70B1-4817-85F1-171F195FFE7E',
    formFactor: 'Next-Gen Budget Dynamic Island',
    focus: 'Next-generation entry tier baseline rendering',
  },
  {
    key: '17',
    name: 'iPhone 17',
    simName: 'LociAR Notes - 17',
    udid: '2B92DBE2-C07C-41FE-91CD-08CD3BEBC5BB',
    formFactor: 'Next-Gen Standard Dynamic Island',
    focus: 'Next-generation mainstream hardware baseline',
  },
  {
    key: '17Pro',
    name: 'iPhone 17 Pro',
    simName: 'LociAR Notes - 17Pro',
    udid: 'B77147F5-AEC8-4CBD-9210-BC980FCDBBE0',
    formFactor: 'Next-Gen Pro Display',
    focus: 'Next-generation Pro form factor and high refresh rendering',
  },
  {
    key: '17ProMax',
    name: 'iPhone 17 Pro Max',
    simName: 'LociAR Notes - 17ProMax',
    udid: '4598BA2B-8AF9-4CAE-9D65-A753E9FE5414',
    formFactor: 'Next-Gen Pro Max Ultra Display',
    focus: 'Next-generation large-scale dynamic safe area handling',
  },
  {
    key: '18Pro',
    name: 'iPhone 18 Pro',
    simName: 'LociAR Notes - 18Pro',
    udid: 'E9818A7D-DABA-4B5F-8487-142013706AA9',
    formFactor: 'Future-Gen Pro Architecture',
    focus: 'Future-gen Pro hardware forward compatibility',
  },
  {
    key: '18ProMax',
    name: 'iPhone 18 Pro Max',
    simName: 'LociAR Notes - 18ProMax',
    udid: 'BE61DD60-5656-455C-93BA-EFA560C08C97',
    formFactor: 'Future-Gen Pro Max Ultra Architecture',
    focus: 'Future-gen flagship ultra screen forward compatibility',
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
    console.log(`[Matrix-Post14] Shutting down ${bootedLines.length} active simulator(s)...`);
    for (const line of bootedLines) {
      const match = line.match(/\(([A-F0-9-]{36})\)/);
      if (match) {
        console.log(`[Matrix-Post14] Shutting down ${match[1]}...`);
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
    console.warn(`[Matrix-Post14] Failed exporting attachments from ${xcresultPath}: ${err.message}`);
  }
}

async function runDevice(device, index, total) {
  const baseOutputDir = resolve(root, 'build/post14pro-device-testing-20261031', device.key);
  const summaryFile = join(baseOutputDir, 'device-summary.json');

  if (process.env.FORCE_RERUN !== '1' && existsSync(summaryFile)) {
    try {
      const existing = JSON.parse(readFileSync(summaryFile, 'utf8'));
      if (existing.success && existing.passedTests?.length === TARGET_TESTS.length) {
        console.log(`\n[Matrix-Post14] [${index + 1}/${total}] SKIPPING ${device.name} (${device.key}) - Already PASSED 100% (${existing.durationSec}s).`);
        return existing;
      }
    } catch {}
  }

  console.log(`\n======================================================================`);
  console.log(`[Matrix-Post14] [${index + 1}/${total}] STARTING DEVICE: ${device.name} (${device.key})`);
  console.log(`[Matrix-Post14] UDID: ${device.udid}`);
  console.log(`[Matrix-Post14] Form Factor: ${device.formFactor}`);
  console.log(`[Matrix-Post14] Focus: ${device.focus}`);
  console.log(`======================================================================\n`);

  ensureNoSimulatorsBooted();

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

  console.log(`\n[Matrix-Post14] Device ${device.name} run finished in ${durationSec}s with exit code ${runResult.status}`);

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
  console.log(`[Matrix-Post14] Shutting down and erasing ${device.name}...`);
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

  console.log(`[Matrix-Post14] Modern Post-14 Pro Device Testing Matrix Starting.`);
  console.log(`[Matrix-Post14] Devices to test: ${targetDevices.map(d => d.key).join(', ')}`);
  console.log(`[Matrix-Post14] Suite per device: ${TARGET_TESTS.join(', ')}`);
  console.log(`[Matrix-Post14] Single active simulator strictly enforced.\n`);

  const results = [];
  for (let i = 0; i < targetDevices.length; i++) {
    const res = await runDevice(targetDevices[i], i, targetDevices.length);
    results.push(res);
  }

  const matrixSummaryPath = resolve(root, 'build/post14pro-device-testing-20261031/matrix-summary.json');
  writeFileSync(matrixSummaryPath, JSON.stringify(results, null, 2));

  console.log(`\n======================================================================`);
  console.log(`[Matrix-Post14] ALL MODERN DEVICES COMPLETED`);
  console.log(`======================================================================`);
  for (const r of results) {
    console.log(`  * ${r.name.padEnd(25)} | ${r.formFactor.padEnd(25)} | ${r.success ? 'PASS' : 'FAIL'} | Passed: ${r.passedTests.length}/${r.totalTargetTests} | ${r.durationSec}s`);
  }
  console.log(`======================================================================\n`);

  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('[Matrix-Post14] Fatal error:', err);
  ensureNoSimulatorsBooted();
  process.exit(1);
});

