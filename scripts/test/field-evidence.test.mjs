import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldEvidenceTemplate, validateFieldEvidence } from '../qa-field-evidence.mjs';

function fixture() {
  const data = fieldEvidenceTemplate();
  Object.assign(data, { commit: 'a'.repeat(40), app_version: '1.0.0', build_number: '42' });
  for (const device of data.devices) Object.assign(device, { model: device.lidar ? 'iPhone 14 Pro' : 'iPhone 13', os_version: '26.6' });
  for (const run of data.runs) Object.assign(run, {
    result: 'passed', captured_at: '2026-10-04T12:00:00Z', pinned_at: '2026-10-03T11:00:00Z',
    resolver: ({ S1: 'cloud_anchor', S2: 'cloud_anchor', S3: 'geospatial', S4: 'world_map', S5: 'aim_guided' })[run.scenario] ?? 'none',
    lock_seconds: 5, drift_cm: 3, sensor_notice_accepted: true, lighting_changed: true,
    vps_available: run.scenario !== 'S4', offline: run.scenario === 'S5', notes: 'Synthetic test fixture, not physical evidence', log: 'run.log', video: 'run.mov',
  });
  return data;
}
test('a blank template cannot be reported as passed', () => {
  assert.ok(validateFieldEvidence(fieldEvidenceTemplate(), '/tmp', false).length);
});
test('both device classes, every scenario and cross-device resolution are required', () => {
  const data = fixture(); assert.deepEqual(validateFieldEvidence(data, '/tmp', false), []);
  data.runs = data.runs.filter(run => !(run.scenario === 'S1' && run.device_id === 'standard'));
  assert.ok(validateFieldEvidence(data, '/tmp', false).some(value => value.includes('missing run')));
  data.devices = data.devices.filter(device => device.lidar);
  assert.ok(validateFieldEvidence(data, '/tmp', false).some(value => value.includes('non-LiDAR')));
});
test('threshold failures and an early 24-hour retry cannot be hidden behind a pass checkbox', () => {
  const data = fixture(); data.runs[0].lock_seconds = 15; data.runs[0].drift_cm = 10;
  data.runs.find(run => run.scenario === 'S2').captured_at = '2026-10-03T12:00:00Z';
  const failures = validateFieldEvidence(data, '/tmp', false);
  for (const text of ['15 seconds', '10 cm', '24 hours']) assert.ok(failures.some(value => value.includes(text)));
});
test('a successful primary resolver does not prove its fallback was exercised', () => {
  const data = fixture(); data.runs.find(run => run.scenario === 'S3').resolver = 'cloud_anchor';
  assert.ok(validateFieldEvidence(data, '/tmp', false).some(value => value.includes('expected resolver')));
});
test('actual artifacts must exist and cannot escape the evidence directory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'loci-field-'));
  try {
    const data = fixture(); assert.ok(validateFieldEvidence(data, root).some(value => value.includes('artifact is missing')));
    writeFileSync(path.join(root, 'run.log'), 'Synthetic fixture'); writeFileSync(path.join(root, 'run.mov'), 'Synthetic fixture');
    assert.deepEqual(validateFieldEvidence(data, root), []);
    data.runs[0].log = '../outside.log';
    assert.ok(validateFieldEvidence(data, root).some(value => value.includes('relative artifact')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
