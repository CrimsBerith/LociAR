import test from 'node:test';
import assert from 'node:assert/strict';
import { containsBlockedTerm } from '../lib/moderation.js';
import { containsURL } from '../lib/moderation.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
const adminCode = ts.transpileModule(readFileSync(new URL('../../admin/lib/content-moderation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const adminModule = { exports: {} };
new Script(adminCode, { filename: 'admin-moderation-under-test.js' }).runInNewContext({
  exports: adminModule.exports,
  require: createRequire(new URL('../../admin/package.json', import.meta.url)),
});
const admin = adminModule.exports;

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

test('bare domains, obfuscated dots, paths and IP addresses are links; a missing space after a full stop is not', () => {
  const links = ['ornek.com', 'Ornek.COM', 'ornek.com.tr', 'bit.ly/abc', 'site.de/x', 'a.b.de', 'shop.example.de', 'x.museum/path',
    'ornek.xn--p1ai', 'ornek.online', 'ornek.cloud/x', 'www.ornek.cloud', 'a.b.today', 'sub.ornek.shop', 'abc.co', 'bit.ly',
    'ornek.com:8080', 'ornek.com?ref=1', 'ornek[.]com', 'ornek (dot) com', 'ornek (nokta) com', '192.168.1.1', 'a@b.co',
    'kişisel.com', 'yandex.рф', 'www.ornek'];
  const sentences = ['tamam.sonra görüşürüz', 'Tamam.Sonra', 'geldim.bekliyorum', 'Harika.Tekrar gelirim', "Saat 3.30'da",
    'v2.5 çıktı', 'Kahve 25.50 TL', '3.14', '1.2.3', 'gel.de bana bak', 'evet.ve hayır', 'Bilmiyorum.ne yapalım',
    'şurada.az kaldı', 'tamam.de?', 'geldin.mi?', 'No.it was fine', 'Mr.Smith', 'a.m.', 'e.g. this', 'ok...see you',
    // Everyday words that are also ICANN TLDs, after a missing space.
    'Geldim.Kim gelecek?', 'Akşam.Moda tarafına geçtik', 'Harika gün.today değil mi', 'ok.how are you', 'Great day.Love it',
    'Bu sokak.istanbul gibi', 'Süper.film gibiydi', 'Çok güzel.Bar kapalıydı', 'Nice view.Fun place'];
  for (const filter of [containsURL, admin.containsURL]) {
    for (const text of links) assert.equal(filter(text), true, text);
    for (const text of sentences) assert.equal(filter(text), false, text);
  }
});
