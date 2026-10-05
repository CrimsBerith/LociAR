import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFailures, CLI_EXCEPTION } from '../check-dependency-audit.mjs';

function fixture() {
  const audit = { auditReportVersion: 2, vulnerabilities: {} };
  const lock = { packages: {} };
  for (const [name, item] of Object.entries(CLI_EXCEPTION.packages)) {
    const node = `node_modules/${name}`;
    audit.vulnerabilities[name] = {
      severity: item.severity, nodes: [node],
      via: item.via.map(value => value.startsWith('https:') ? { url: value } : value),
    };
    lock.packages[node] = { dev: true, version: item.version };
  }
  return { audit, lock };
}
const now = new Date('2026-10-05T00:00:00Z');

test('the exact temporary CLI graph is visible and allowed only in functions', () => {
  const { audit, lock } = fixture();
  assert.deepEqual(auditFailures(audit, lock, true, now), []);
  assert.equal(auditFailures(audit, lock, false, now).length, 3);
});
test('runtime exposure, a new advisory and a changed installed version fail', () => {
  for (const change of [
    ({ lock }) => { lock.packages['node_modules/braces'].dev = false; },
    ({ audit }) => { audit.vulnerabilities.braces.via.push({ url: 'https://github.com/advisories/new' }); },
    ({ lock }) => { lock.packages['node_modules/firebase-tools'].version = '15.32.2'; },
    ({ audit }) => { audit.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces'); },
  ]) {
    const item = fixture(); change(item);
    assert.ok(auditFailures(item.audit, item.lock, true, now).length);
  }
});
test('an expired exception and malformed registry responses fail closed', () => {
  const { audit, lock } = fixture();
  assert.equal(auditFailures(audit, lock, true, new Date(CLI_EXCEPTION.expires)).length, 3);
  assert.ok(auditFailures({ error: {} }, lock, true, now).length);
});
test('a fully clean tree does not require an exception, even after its expiry', () => {
  assert.deepEqual(auditFailures({ auditReportVersion: 2, vulnerabilities: {} }, { packages: {} }, true, new Date('2027-01-01')), []);
});

test('the repaired OpenTelemetry chain cannot use the remaining watcher exception', () => {
  const { audit, lock } = fixture();
  const node = 'node_modules/@opentelemetry/core';
  lock.packages[node] = { dev: true, version: '1.30.1' };
  audit.vulnerabilities['@opentelemetry/core'] = {
    severity: 'moderate', nodes: [node],
    via: [{ url: 'https://github.com/advisories/GHSA-8988-4f7v-96qf' }],
  };
  audit.vulnerabilities['firebase-tools'].via.push('@google-cloud/pubsub');
  assert.equal(auditFailures(audit, lock, true, now).length, 2);
});
