import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// These are upstream CLI defects, not production dependencies. Keep the exact
// affected graph visible and fail on expiry, new advisories or runtime exposure.
export const CLI_EXCEPTION = {
  expires: '2026-10-18T00:00:00Z',
  packages: {
    braces: { version: '3.0.3', severity: 'high', via: ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'] },
    chokidar: { version: '3.6.0', severity: 'high', via: ['braces'] },
    'firebase-tools': { version: '15.32.1', severity: 'high', via: ['chokidar'] },
  },
};

export function auditFailures(audit, lock, allowCli, now = new Date()) {
  if (audit.error || audit.auditReportVersion !== 2 || !audit.vulnerabilities || !lock.packages) {
    return ['The registry did not return a valid audit report or lockfile.'];
  }
  const failures = [];
  for (const [name, item] of Object.entries(audit.vulnerabilities)) {
    const exception = allowCli && CLI_EXCEPTION.packages[name];
    const via = item.via.map(value => typeof value === 'string' ? value : value.url).sort();
    const knownGraph = exception && item.severity === exception.severity &&
      JSON.stringify(via) === JSON.stringify([...exception.via].sort()) &&
      item.nodes.length === 1 && item.nodes[0] === `node_modules/${name}` &&
      item.nodes.every(node => lock.packages[node]?.dev === true && lock.packages[node]?.version === exception.version);
    if (!knownGraph) failures.push(`${name}: unapproved ${item.severity} dependency finding`);
    else if (now >= new Date(CLI_EXCEPTION.expires)) failures.push(`${name}: CLI exception has expired`);
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const target = process.argv[2];
  if (!['functions', 'admin'].includes(target)) throw new Error('Usage: node scripts/check-dependency-audit.mjs functions|admin');
  const cwd = path.join(root, target);
  const result = spawnSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('npm audit could not complete');
  const audit = JSON.parse(result.stdout);
  const lock = JSON.parse(readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'));
  const failures = auditFailures(audit, lock, target === 'functions');
  for (const [name, item] of Object.entries(audit.vulnerabilities ?? {})) {
    console.log(`${target}: ${name}: ${item.severity} (${item.nodes.length} location(s))`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    const count = Object.keys(audit.vulnerabilities).length;
    console.log(count ? `Only the ${count} known CLI findings remain; exception expires ${CLI_EXCEPTION.expires}.` : `${target}: full dependency audit is clean.`);
  }
}
