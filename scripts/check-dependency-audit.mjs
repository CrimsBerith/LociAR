import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Fail closed: any finding in the full tree (production or development) stops CI. The last
// development-only finding (braces via the CLI's chokidar 3) was removed with a package.json override.
export function auditFailures(audit) {
  if (audit.error || audit.auditReportVersion !== 2 || !audit.vulnerabilities) {
    return ['The registry did not return a valid audit report.'];
  }
  return Object.entries(audit.vulnerabilities).map(([name, item]) => `${name}: ${item.severity} dependency finding`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const target = process.argv[2];
  if (!['functions', 'admin'].includes(target)) throw new Error('Usage: node scripts/check-dependency-audit.mjs functions|admin');
  const cwd = path.join(root, target);
  const result = spawnSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('npm audit could not complete');
  const audit = JSON.parse(result.stdout);
  const failures = auditFailures(audit);
  for (const [name, item] of Object.entries(audit.vulnerabilities ?? {})) {
    console.log(`${target}: ${name}: ${item.severity} (${item.nodes.length} location(s))`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`${target}: full dependency audit is clean.`);
  }
}
