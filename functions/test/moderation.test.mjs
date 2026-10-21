import test from 'node:test';
import assert from 'node:assert/strict';
import { containsBlockedTerm } from '../lib/moderation.js';
import { containsURL } from '../lib/moderation.js';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const adminCode = ts.transpileModule(readFileSync(new URL('../../admin/lib/content-moderation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const admin = await import('data:text/javascript;base64,' + Buffer.from(adminCode + '\n//# sourceURL=admin-moderation-under-test.js').toString('base64'));

test('flags blocked words, leet and spaced spellings; ignores normal text', () => {
  assert.equal(containsBlockedTerm('Harika bir yer, tekrar geleceğim!'), false);
  assert.equal(containsBlockedTerm('Göteborg çok güzel'), false);
  assert.equal(containsBlockedTerm('Classic assessment'), false);
  assert.equal(containsBlockedTerm('siktir git'), true);
  assert.equal(containsBlockedTerm('SİKTİR'), true);
  assert.equal(containsBlockedTerm('f u c k this'), true);
  assert.equal(containsBlockedTerm('you b1tch'), true);
});

test('all 12 languages reject representative abuse in both publishing surfaces', () => {
  const cases = ['SIKTIR', 'BITCH', '操你妈', 'तुम चूतिया हो', 'gilipollas', 'connard', 'شَرْمُوطَة',
    'তুমি বোকাচোদা', 'caralho', 'пиздец', 'ARSCHLOCH', 'お前は死ね！'];
  for (const value of cases) {
    assert.equal(containsBlockedTerm(value), true, value); assert.equal(admin.containsBlockedTerm(value), true, value);
  }
});

test('Unicode evasions, directed insults and links cannot bypass the filter; ordinary reviews remain allowed', () => {
  for (const filter of [containsBlockedTerm, admin.containsBlockedTerm]) {
    for (const text of ['f\u200Duck', 'ＦＵＣＫ', 'SİKTİR', 'you are a retard', 'f u c k']) assert.equal(filter(text), true, text);
    for (const text of ['Bu ürün kalitesiz, alma.', 'Ils arrivent en retard.', 'I am late.', '这家店很好', 'यह दुकान अच्छी है', 'এই দোকানটি ভালো', 'هذا متجر جيد', 'f price u value c stock k', '死ねないキャラクター']) assert.equal(filter(text), false, text);
  }
  for (const filter of [containsURL, admin.containsURL]) {
    for (const text of ['ｈｔｔｐｓ：／／example．com', 'h\u200Bttps://example.com', 'https://example.com']) assert.equal(filter(text), true, text);
    assert.equal(filter('This product is low quality.'), false);
  }
});
