import { readFileSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCENARIOS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12'];
export function fieldEvidenceTemplate() {
  const devices = [
    { id: 'lidar', model: '', os_version: '', lidar: true },
    { id: 'standard', model: '', os_version: '', lidar: false },
  ];
  return { version: 1, commit: '', app_version: '', build_number: '', devices,
    runs: devices.flatMap(device => SCENARIOS.filter(s => s !== 'S8' || !device.lidar).map(scenario => ({
      scenario, device_id: device.id, pin_device_id: scenario === 'S1' ? (device.lidar ? 'standard' : 'lidar') : device.id,
      result: 'not_run', captured_at: '', pinned_at: '', resolver: 'none',
      lock_seconds: null, drift_cm: null, lighting_changed: null, vps_available: null, offline: null,
      sensor_notice_accepted: null, notes: '', log: '', video: '',
    }))) };
}
function present(value) { return typeof value === 'string' && value.trim().length > 0; }
function validDate(value) { return present(value) && Number.isFinite(Date.parse(value)); }
export function validateFieldEvidence(data, artifactRoot, inspectArtifacts = true) {
  const failures = [];
  if (data.version !== 1 || !/^[0-9a-f]{40}$/i.test(data.commit ?? '')) failures.push('Record the exact release candidate commit');
  if (!present(data.app_version) || !present(data.build_number)) failures.push('App version and build number are required');
  const devices = Array.isArray(data.devices) ? data.devices : [];
  if (!devices.some(d => d.lidar === true) || !devices.some(d => d.lidar === false)) failures.push('LiDAR and non-LiDAR devices are required');
  const ids = new Set();
  for (const device of devices) {
    if (!present(device.id) || ids.has(device.id) || !present(device.model) || !present(device.os_version) || typeof device.lidar !== 'boolean') failures.push('Each device needs a unique id, model, OS and LiDAR capability');
    ids.add(device.id);
  }
  const runs = Array.isArray(data.runs) ? data.runs : [];
  for (const device of devices) for (const scenario of SCENARIOS) {
    if (scenario === 'S8' && device.lidar) continue;
    if (!runs.some(run => run.device_id === device.id && run.scenario === scenario)) failures.push(`${device.id}/${scenario}: missing run`);
  }
  for (const run of runs) {
    const label = `${run.device_id}/${run.scenario}`;
    if (!ids.has(run.device_id) || !SCENARIOS.includes(run.scenario)) failures.push(`${label}: unknown device or scenario`);
    if (run.result !== 'passed') failures.push(`${label}: has not passed`);
    if (!validDate(run.captured_at) || !present(run.notes) || run.sensor_notice_accepted !== true) failures.push(`${label}: date, notes and sensor consent are required`);
    if (!['cloud_anchor', 'geospatial', 'world_map', 'aim_guided', 'none'].includes(run.resolver)) failures.push(`${label}: invalid resolver`);
    const expected = { S1: ['cloud_anchor'], S2: ['cloud_anchor'], S3: ['geospatial'], S4: ['world_map'], S5: ['world_map', 'aim_guided'] }[run.scenario];
    if (expected && !expected.includes(run.resolver)) failures.push(`${label}: expected resolver was not exercised`);
    if (['S1', 'S2', 'S3', 'S4'].includes(run.scenario)) {
      if (!Number.isFinite(run.lock_seconds) || run.lock_seconds < 0 || run.lock_seconds >= 15) failures.push(`${label}: physical lock must be below 15 seconds`);
      if (!Number.isFinite(run.drift_cm) || run.drift_cm < 0 || run.drift_cm >= 10) failures.push(`${label}: measured drift must be below 10 cm`);
    }
    if (run.scenario === 'S1' && (!ids.has(run.pin_device_id) || run.pin_device_id === run.device_id)) failures.push(`${label}: cross-device resolution is required`);
    if (run.scenario === 'S2' && (!validDate(run.pinned_at) || !validDate(run.captured_at) || Date.parse(run.captured_at) - Date.parse(run.pinned_at) < 24 * 3600_000 || run.lighting_changed !== true)) failures.push(`${label}: wait at least 24 hours and change lighting`);
    if (run.scenario === 'S3' && run.vps_available !== true) failures.push(`${label}: VPS coverage must be recorded`);
    if (run.scenario === 'S4' && run.vps_available !== false) failures.push(`${label}: record that VPS is unavailable`);
    if (run.scenario === 'S5' && run.offline !== true) failures.push(`${label}: offline condition must be recorded`);
    for (const kind of ['log', 'video']) {
      const relative = run[kind];
      if (!present(relative) || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) { failures.push(`${label}: ${kind} must be a relative artifact path`); continue; }
      if (inspectArtifacts) {
        try {
          const root = realpathSync(artifactRoot);
          const file = realpathSync(path.resolve(root, relative));
          if (!file.startsWith(root + path.sep) || !statSync(file).isFile() || statSync(file).size === 0) failures.push(`${label}: ${kind} is empty or outside the artifact directory`);
        } catch { failures.push(`${label}: ${kind} artifact is missing`); }
      }
    }
  }
  return failures;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--template') {
    const file = process.argv[3];
    if (!file || !path.isAbsolute(file)) throw new Error('Use an absolute output path for the evidence template');
    writeFileSync(file, JSON.stringify(fieldEvidenceTemplate(), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Created a blank field evidence template; all runs are not_run.');
  } else {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node scripts/qa-field-evidence.mjs /path/to/evidence.json');
    const failures = validateFieldEvidence(JSON.parse(readFileSync(file, 'utf8')), path.dirname(path.resolve(file)));
    for (const failure of failures) console.error(failure);
    console.log(failures.length ? `Field evidence is incomplete: ${failures.length} checks failed.` : 'Recorded field evidence passes structural checks. A reviewer must inspect the logs and videos.');
    if (failures.length) process.exitCode = 1;
  }
}
