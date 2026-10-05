import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGUAGES = ['tr', 'en', 'zh-Hans', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'de', 'ja'];
const formatArguments = value => [...value.matchAll(/%(?:\d+\$)?(@|lld|lli|d|f|g)/g)].map(item => item[1]).sort();
function units(value) {
  if (value.stringUnit) return [value.stringUnit];
  return Object.values(value.variations ?? {}).flatMap(variation => Object.values(variation).flatMap(units));
}
export function validateCatalog(catalog, release = false) {
  const failures = [];
  if (catalog.version !== '1.0' || !LANGUAGES.includes(catalog.sourceLanguage)) failures.push('Unsupported catalog metadata');
  for (const [key, entry] of Object.entries(catalog.strings)) {
    const source = units(entry.localizations?.[catalog.sourceLanguage] ?? {})[0]?.value;
    if (typeof source !== 'string') { failures.push(`${key}: missing source translation`); continue; }
    for (const language of LANGUAGES) {
      const values = units(entry.localizations?.[language] ?? {});
      if (!values.length) failures.push(`${key}: missing ${language}`);
      for (const unit of values) {
        if (typeof unit.value !== 'string' || !unit.value.trim()) failures.push(`${key}: empty ${language}`);
        else if (JSON.stringify(formatArguments(unit.value)) !== JSON.stringify(formatArguments(source))) failures.push(`${key}: ${language} format arguments differ`);
        if (!['translated', 'needs_review'].includes(unit.state)) failures.push(`${key}: ${language} is incomplete`);
        else if (release && unit.state !== 'translated') failures.push(`${key}: ${language} still needs linguistic review`);
      }
    }
  }
  return failures;
}

// Extract whole Swift literals, skipping comments and balancing expressions such
// as \(Int(accuracy)). A line regex alone misses formatted messages and raw errors.
export function swiftStrings(source) {
  const values = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
    if (source.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) { depth++; i += 2; }
        else if (source.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (source[i] !== '"') { i++; continue; }
    const start = i++;
    while (i < source.length) {
      if (source.startsWith('\\(', i)) {
        let depth = 1; i += 2;
        while (i < source.length && depth) {
          if (source[i] === '"') {
            i++;
            while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
            i++;
          } else if (source[i] === '(') { depth++; i++; }
          else if (source[i] === ')') { depth--; i++; }
          else i++;
        }
      } else if (source[i] === '\\') i += 2;
      else if (source[i++] === '"') break;
    }
    values.push({ start, end: i, value: source.slice(start + 1, i - 1) });
  }
  return values;
}

export function localizationKey(value) {
  return value.replace(/\\\(Int\(accuracy\)\)/g, '%lld').replace(/\\\(([^()]+)\)/g, (_, expression) =>
    ['degrees', 'nearbyPosts.count', 'posts.count', 'failedCount', 'value'].includes(expression) ? '%lld' : '%@'
  ).replace(/\\n/g, '\n');
}
function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(path.join(root, entry.name)) : entry.name.endsWith('.swift') ? [path.join(root, entry.name)] : []);
}
export function missingSourceKeys(source, catalog) {
  const failures = [];
  for (const token of swiftStrings(source)) {
    const prefix = source.slice(Math.max(0, token.start - 180), token.start);
    const line = source.slice(source.lastIndexOf('\n', token.start) + 1, source.indexOf('\n', token.end) < 0 ? source.length : source.indexOf('\n', token.end));
    // Technical logs, diagnostic composites, debug menu and a preview user's bio
    // are not shipping UI keys. User captions, handles and URLs remain verbatim.
    if (['logger.', 'logger?', 'World-map ', 'Geçersiz AR durum', 'Takip \\(tracking', 'ARCore kapsam kontrolü (debug)', 'Şehrin unutulan hikâyelerini'].some(value => line.includes(value))) continue;
    const explicit = /(?:String\(localized:\s*|NSLocalizedString\(\s*)$/.test(prefix);
    const ui = /(?:Text|Label|Button|TextField|SecureField|navigationTitle|alert|confirmationDialog|accessibilityLabel|accessibilityHint|Section|Link)\(\s*$/.test(prefix) ||
      /(?:title|message|actionTitle|prompt):\s*$/.test(prefix);
    const turkish = /[çğıöşüâîûÇĞİÖŞÜÂÎÛ]/.test(token.value);
    if (!explicit && !ui && !turkish) continue;
    if (token.value.includes('\\(cleanHandle')) continue; // Username with a localized fallback inside the expression.
    const key = localizationKey(token.value);
    if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(key.replace(/%(?:lld|@)/g, ''))) continue;
    if (!catalog.strings[key]) failures.push(`${source.slice(0, token.start).split('\n').length}: missing key ${key}`);
    if (turkish && !explicit && !ui && !/\bcase\s+\w+\s*=\s*$/.test(prefix)) failures.push(`${source.slice(0, token.start).split('\n').length}: raw Turkish UI message`);
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const release = process.argv.includes('--release');
  const catalogs = ['Localizable', 'InfoPlist'].map(name => JSON.parse(readFileSync(path.join(root, `LociAR/Resources/${name}.xcstrings`), 'utf8')));
  const failures = catalogs.flatMap(catalog => validateCatalog(catalog, release));
  for (const file of sourceFiles(path.join(root, 'LociAR'))) {
    if (['UITestFixtures.swift', 'ARCoreCoverageDebugView.swift'].includes(path.basename(file))) continue;
    failures.push(...missingSourceKeys(readFileSync(file, 'utf8'), catalogs[0]).map(failure => `${path.relative(root, file)}:${failure}`));
  }
  const reviewCount = catalogs.reduce((count, catalog) => count + Object.values(catalog.strings).reduce((n, entry) =>
    n + Object.values(entry.localizations).reduce((total, value) => total + units(value).filter(unit => unit.state === 'needs_review').length, 0), 0), 0);
  for (const failure of failures) console.error(failure);
  console.log(`${catalogs.reduce((sum, catalog) => sum + Object.keys(catalog.strings).length, 0)} keys; ${LANGUAGES.length} languages; ${reviewCount} translations marked needs_review.`);
  if (failures.length) process.exitCode = 1;
}
