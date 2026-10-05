import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep findings value-free: CI logs must never reproduce the matched credential.
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['service-account', /"type"\s*:\s*"service_account"/g],
  ['review-password', /\bReview_[A-Za-z0-9]+_\d{4}!/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['literal-credential', /\b[\w]*(?:password|passwd|client_?secret|access_?token|refresh_?token|private_?key|api_?key)[\w]*["']?\s*[:=]\s*["']([^"'`\r\n]{8,})["']/gi],
  ['document-password', /(?<![\p{L}\p{N}_])(?:Password|Şifre|Parola)\s*(?:\([^)]+\))?\s*(?:\*\*)?\s*[:|]\s*(?:\*\*)?\s*`([^`\r\n]+)`/giu],
];

function placeholder(value) {
  return /^(?:\$|<[^>]*>$|\[[^\]]*\]$|YOUR[_-]|ci-placeholder$|fake-api-key$|changeme$)/i.test(value);
}

function sensitiveFile(path) {
  const name = basename(path);
  return (name === '.env' || name.startsWith('.env.')) && name !== '.env.example'
    || name === '.secret.local'
    || name.endsWith('.credentials.json');
}

export function scanRepository(root) {
  const paths = new Set(execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z',
  ], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
  const findings = [];
  for (const path of paths) {
    const absolute = resolve(root, path);
    let stat;
    try { stat = lstatSync(absolute); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    // Do not follow repository symlinks to machine-local credential files.
    if (!stat.isFile()) continue;
    if (sensitiveFile(path)) findings.push({ path, line: 1, rule: 'credential-file' });
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) continue;
    const source = bytes.toString('utf8');
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        if (match[1] && placeholder(match[1])) continue;
        findings.push({ path, line: source.slice(0, match.index).split('\n').length, rule });
      }
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const findings = scanRepository(root);
    for (const finding of findings) {
      // JSON quoting also prevents newline/control characters in paths spoofing log entries.
      console.error(`${JSON.stringify(finding.path)}:${finding.line} [${finding.rule}]`);
    }
    if (findings.length) {
      console.error(`Secret scan failed: ${findings.length} finding(s); values withheld.`);
      process.exitCode = 1;
    } else {
      console.log('Secret scan passed (tracked and non-ignored files, including docs and tests).');
    }
  } catch {
    console.error('Secret scan could not complete. Run it in a readable Git repository.');
    process.exitCode = 2;
  }
}
