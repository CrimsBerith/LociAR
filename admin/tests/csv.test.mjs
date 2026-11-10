import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows } from '../lib/csv.ts';

test('csv rows keep quoted commas, doubled quotes and line breaks', () => {
  assert.deepEqual(parseCsvRows('handle,bio\r\nada,"Hi, ""there""\nline two"\n\n bob ,plain'), [
    ['handle', 'bio'], ['ada', 'Hi, "there"\nline two'], [' bob ', 'plain'],
  ]);
});

test('csv rows drop blank lines and keep empty cells', () => {
  assert.deepEqual(parseCsvRows('a,,c\n,,\n\nd,e,'), [['a', '', 'c'], ['d', 'e', '']]);
  assert.deepEqual(parseCsvRows(''), []);
});

test('csv rows reject an unclosed quoted field', () => {
  assert.throws(() => parseCsvRows('a,"open\nb'), /unclosed quoted field/);
});
