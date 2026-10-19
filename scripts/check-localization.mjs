import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGUAGES = ['tr', 'en', 'zh-Hans', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'de', 'ja'];
const formatArguments = value => [...value.matchAll(/%(?:\d+\$)?(@|lld|lli|d|f|g)/g)].map(item => item[1]).sort((a, b) => a.localeCompare(b));
function units(value) {
  if (value.stringUnit) return [value.stringUnit];
  return Object.values(value.variations ?? {}).flatMap(variation => Object.values(variation).flatMap(units));
}
function validateUnit(key, language, unit, source, release) {
  const failures = [];
  if (typeof unit.value !== 'string' || !unit.value.trim()) failures.push(`${key}: empty ${language}`);
  else if (JSON.stringify(formatArguments(unit.value)) !== JSON.stringify(formatArguments(source))) failures.push(`${key}: ${language} format arguments differ`);
  if (!['translated', 'needs_review'].includes(unit.state)) failures.push(`${key}: ${language} is incomplete`);
  else if (release && unit.state !== 'translated') failures.push(`${key}: ${language} still needs linguistic review`);
  return failures;
}
function validateEntry(key, entry, sourceLanguage, release) {
  const source = units(entry.localizations?.[sourceLanguage] ?? {})[0]?.value;
  if (typeof source !== 'string') return [`${key}: missing source translation`];
  return LANGUAGES.flatMap(language => {
    const values = units(entry.localizations?.[language] ?? {});
    if (!values.length) return [`${key}: missing ${language}`];
    return values.flatMap(unit => validateUnit(key, language, unit, source, release));
  });
}
export function validateCatalog(catalog, release = false) {
  const failures = [];
  if (catalog.version !== '1.0' || !LANGUAGES.includes(catalog.sourceLanguage)) failures.push('Unsupported catalog metadata');
  for (const [key, entry] of Object.entries(catalog.strings)) failures.push(...validateEntry(key, entry, catalog.sourceLanguage, release));
  return failures;
}

export function catalogReviewCount(catalog) {
  return Object.values(catalog.strings).reduce((count, entry) => count +
    Object.values(entry.localizations ?? {}).reduce((total, value) =>
      total + units(value).filter(unit => unit.state === 'needs_review').length, 0), 0);
}

// Extract whole Swift literals, skipping comments and balancing expressions such
// as \(Int(accuracy)). A line regex alone misses formatted messages and raw errors.
function blockCommentEnd(source, start) {
  let depth = 1, i = start + 2;
  while (i < source.length && depth) {
    if (source.startsWith('/*', i)) { depth++; i += 2; }
    else if (source.startsWith('*/', i)) { depth--; i += 2; }
    else i++;
  }
  return i;
}
function quotedExpressionEnd(source, start) {
  let i = start + 1;
  while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
  return i + 1;
}
function interpolationEnd(source, start) {
  let depth = 1, i = start + 2;
  while (i < source.length && depth) {
    if (source[i] === '"') i = quotedExpressionEnd(source, i);
    else {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
  }
  return i;
}
function literalEnd(source, start) {
  let i = start + 1;
  while (i < source.length) {
    if (source.startsWith(String.raw`\(`, i)) i = interpolationEnd(source, i);
    else if (source[i] === '\\') i += 2;
    else if (source[i++] === '"') break;
  }
  return i;
}
export function swiftStrings(source) {
  const values = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
    if (source.startsWith('/*', i)) { i = blockCommentEnd(source, i); continue; }
    if (source[i] !== '"') { i++; continue; }
    const start = i;
    i = literalEnd(source, start);
    values.push({ start, end: i, value: source.slice(start + 1, i - 1) });
  }
  return values;
}

export function localizationKey(value) {
  return value.replaceAll(String.raw`\(Int(accuracy))`, '%lld').replaceAll(/\\\(([^()]+)\)/g, (_, expression) =>
    ['degrees', 'nearbyPosts.count', 'posts.count', 'failedCount', 'value', 'meters', 'newCount', 'likeCount', 'noteCount', 'cell.count', 'blob.count', 'cluster.posts.count'].includes(expression) ? '%lld' : '%@'
  ).replaceAll(String.raw`\n`, '\n');
}
function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.name.endsWith('.swift') ? [file] : [];
  });
}

function uiToken(token, prefix) {
    const explicit = /(?:String\(localized:\s*|NSLocalizedString\(\s*)$/.test(prefix);
    const ui = /(?:Text|Label|Button|TextField|SecureField|navigationTitle|alert|confirmationDialog|accessibilityLabel|accessibilityHint|Section|Link)\(\s*$/.test(prefix) ||
      /(?:title|message|actionTitle|prompt):\s*$/.test(prefix);
    const turkish = /[çğıöşüâîûÇĞİÖŞÜÂÎÛ]/.test(token.value);
    if (!explicit && !ui && !turkish) return null;
    if (token.value.includes(String.raw`\(cleanHandle`)) return null; // Username with a localized fallback inside the expression.
    return { explicit, ui, turkish };
}

export function missingSourceKeys(source, catalog) {
  const failures = [];
  for (const token of swiftStrings(source)) {
    const prefix = source.slice(Math.max(0, token.start - 180), token.start);
    const end = source.indexOf('\n', token.end);
    const line = source.slice(source.lastIndexOf('\n', token.start) + 1, end < 0 ? source.length : end);
    // Technical logs, diagnostic composites, debug menu and a preview user's bio
    // are not shipping UI keys. User captions, handles and URLs remain verbatim.
    if (['logger.', 'logger?', 'World-map ', 'Geçersiz AR durum', String.raw`Takip \(tracking`, 'ARCore kapsam kontrolü (debug)', 'Şehrin unutulan hikâyelerini'].some(value => line.includes(value))) continue;
    const context = uiToken(token, prefix);
    if (!context) continue;
    const { explicit, ui, turkish } = context;
    const key = localizationKey(token.value);
    if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(key.replaceAll(/%(?:lld|@)/g, ''))) continue;
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
  const reviewCount = catalogs.reduce((count, catalog) => count + catalogReviewCount(catalog), 0);
  for (const failure of failures) console.error(failure);
  console.log(`${catalogs.reduce((sum, catalog) => sum + Object.keys(catalog.strings).length, 0)} keys; ${LANGUAGES.length} languages; ${reviewCount} translations marked needs_review.`);
  if (failures.length) process.exitCode = 1;
}
