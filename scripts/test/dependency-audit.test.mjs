import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFailures } from '../check-dependency-audit.mjs';

const finding = (severity) => ({ severity, nodes: ['node_modules/pkg'], via: [{ url: 'https://github.com/advisories/example' }] });

test('a clean tree passes', () => {
  assert.deepEqual(auditFailures({ auditReportVersion: 2, vulnerabilities: {} }), []);
});
test('any finding fails, development tools included and whatever its severity', () => {
  for (const severity of ['low', 'moderate', 'high', 'critical']) {
    assert.deepEqual(auditFailures({ auditReportVersion: 2, vulnerabilities: { pkg: finding(severity) } }), [`pkg: ${severity} dependency finding`]);
  }
  // The former CLI exception graph is no longer allowed.
  const cli = { braces: finding('high'), chokidar: finding('high'), 'firebase-tools': finding('high') };
  assert.equal(auditFailures({ auditReportVersion: 2, vulnerabilities: cli }).length, 3);
});
test('malformed registry responses fail closed', () => {
  assert.ok(auditFailures({ error: {} }).length);
  assert.ok(auditFailures({ auditReportVersion: 1, vulnerabilities: {} }).length);
  assert.ok(auditFailures({ auditReportVersion: 2 }).length);
});
