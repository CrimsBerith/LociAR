import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCatalog, missingSourceKeys, localizationKey, LANGUAGES } from '../check-localization.mjs';

function catalog() {
  const localizations = Object.fromEntries(LANGUAGES.map(language => [language, {
    stringUnit: { state: 'translated', value: 'Message %lld %@' },
  }]));
  return { version: '1.0', sourceLanguage: 'en', strings: { 'Message %lld %@': { localizations } } };
}
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
