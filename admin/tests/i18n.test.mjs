import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hasTurkish, resolveLang, translator } from '../lib/i18n.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = globSync('app/admin/**/*.tsx', { cwd: root });

test('every literal admin UI string has a Turkish translation', () => {
  const missing = new Set();
  const call = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  const label = /\blabel:\s*'((?:[^'\\]|\\.)*)'/g;
  for (const file of sources) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(call)) {
      const key = (match[1] ?? match[2]).replaceAll("\\'", "'");
      if (!hasTurkish(key)) missing.add(`${file}: ${key}`);
    }
    for (const match of text.matchAll(label)) {
      if (!hasTurkish(match[1])) missing.add(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('language comes from the saved cookie, then the browser', () => {
  assert.equal(resolveLang('tr', 'en-US'), 'tr');
  assert.equal(resolveLang('en', 'tr-TR'), 'en');
  assert.equal(resolveLang(undefined, 'tr-TR,tr;q=0.9,en;q=0.8'), 'tr');
  assert.equal(resolveLang(undefined, 'en-US,en;q=0.9'), 'en');
  assert.equal(resolveLang('de', null), 'en');
});

test('translator keeps English, translates Turkish, fills placeholders and maps API codes', () => {
  const en = translator('en');
  const tr = translator('tr');
  assert.equal(en('Users'), 'Users');
  assert.equal(tr('Users'), 'Kullanıcılar');
  assert.equal(tr('Created @{handle} · {id}', { handle: 'ayse', id: '42' }), '@ayse oluşturuldu · 42');
  assert.equal(en('handle_taken'), 'This handle is already taken. (handle_taken)');
  assert.equal(tr('handle_taken'), 'Bu kullanıcı adı alınmış. (handle_taken)');
  assert.equal(tr('reason must be between 8 and 1000 characters'), 'Gerekçe 8–1000 karakter olmalı');
  assert.equal(tr('A string nobody translated'), 'A string nobody translated');
});
