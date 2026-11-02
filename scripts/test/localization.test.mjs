import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { validateCatalog, catalogReviewCount, missingSourceKeys, localizationKey, LANGUAGES } from '../check-localization.mjs';

function catalog() {
  const localizations = Object.fromEntries(LANGUAGES.map(language => [language, {
    stringUnit: { state: 'translated', value: 'Message %lld %@' },
  }]));
  return { version: '1.0', sourceLanguage: 'en', strings: { 'Message %lld %@': { localizations } } };
}
test('Xcode entries without translations report missing source without crashing review counting', () => {
  const c = catalog();
  c.strings['@%@'] = { comment: 'A user handle' };
  c.strings['Message %lld %@'].localizations.ar.stringUnit.state = 'needs_review';
  assert.ok(validateCatalog(c, true).includes('@%@: missing source translation'));
  assert.equal(catalogReviewCount(c), 1);
});
test('catalog generation tolerates Xcode formatting but rejects changed translations and missing files', () => {
  execFileSync('python3', ['-c', `
import json, pathlib, runpy, tempfile
matches = runpy.run_path('scripts/l10n/build_catalog.py')['catalog_matches']
expected = {'strings': {'CFBundleName': {'localizations': {'en': {'stringUnit': {'state': 'translated', 'value': 'LociAR'}}}}}, 'version': '1.0'}
with tempfile.TemporaryDirectory() as folder:
    path = pathlib.Path(folder) / 'InfoPlist.xcstrings'
    path.write_text(json.dumps(expected, sort_keys=True, separators=(',', ':')))
    assert matches(path, expected), 'Xcode key ordering and whitespace must be accepted'
    changed = json.loads(json.dumps(expected))
    changed['strings']['CFBundleName']['localizations']['en']['stringUnit']['state'] = 'needs_review'
    path.write_text(json.dumps(changed))
    assert not matches(path, expected), 'Translation state changes must fail'
    changed['strings']['CFBundleName']['localizations']['en']['stringUnit'] = {'state': 'translated', 'value': 'Wrong name'}
    path.write_text(json.dumps(changed))
    assert not matches(path, expected), 'Translation value changes must fail'
    path.write_text('{}')
    assert not matches(path, expected), 'Missing translations must fail'
    path.write_text('{')
    assert not matches(path, expected), 'Invalid JSON must fail'
    path.unlink()
    assert not matches(path, expected), 'Missing catalogs must fail'
`], { cwd: new URL('../..', import.meta.url), stdio: 'pipe' });
});
test('missing languages, changed argument types and duplicated arguments are rejected', () => {
  for (const mutate of [
    c => { delete c.strings['Message %lld %@'].localizations.ar; },
    c => { c.strings['Message %lld %@'].localizations.ar.stringUnit.value = 'Message %@ %@'; },
    c => { c.strings['Message %lld %@'].localizations.ar.stringUnit.value = 'Message %lld %@ %@'; },
  ]) { const c = catalog(); mutate(c); assert.ok(validateCatalog(c).length); }
});
test('positional arguments allow translated word order, while release mode rejects unreviewed copy', () => {
  const c = catalog(); c.strings['Message %lld %@'].localizations.ar.stringUnit.value = '%2$@ %1$lld';
  assert.deepEqual(validateCatalog(c), []);
  c.strings['Message %lld %@'].localizations.ar.stringUnit.state = 'needs_review';
  assert.deepEqual(validateCatalog(c), []); assert.ok(validateCatalog(c, true).length);
});
test('formatted messages are extracted as whole keys, including nested Int expressions', () => {
  const c = { strings: { 'Konum %lld m': {}, 'Message %lld %@': {} } };
  assert.deepEqual(missingSourceKeys('let msg = String(localized: "Konum \\(Int(accuracy)) m")', c), []);
  assert.deepEqual(missingSourceKeys('Text("Message \\(value) \\(handle)")', c), []);
  assert.equal(localizationKey('Konum \\(Int(accuracy)) m'), 'Konum %lld m');
});
test('new UI literals and untranslated error messages fail; comments and user handles do not', () => {
  assert.ok(missingSourceKeys('Text("Eksik metin")', { strings: {} }).length);
  assert.ok(missingSourceKeys('let message = "İşlem reddedildi"', { strings: { 'İşlem reddedildi': {} } }).length);
  assert.deepEqual(missingSourceKeys('// Text("Eksik metin")\nText("@\\(user.handle)")', { strings: {} }), []);
});
