import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { Timestamp } from 'firebase-admin/firestore';

const module = { exports: {} };
const source = ts.transpileModule(readFileSync(new URL('../lib/pagination.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(source, { module, exports: module.exports, require: createRequire(import.meta.url), Buffer, URLSearchParams });
const { encodeCursor, decodeCursor, pageCursors, pageHref, textParameter, InvalidCursorError } = module.exports;
const document = (id, value) => ({ id, get: () => value });

// Firestore timestamps must not be rounded to milliseconds: identical milliseconds can be distinct rows.
test('timestamp and string cursors preserve exact values and bind to the current filter scope', () => {
  const timestamp = new Timestamp(1_800_000_000, 123_456_789);
  const token = encodeCursor(document('tie-breaker', timestamp), 'created_at', 'active:caption');
  const parsed = decodeCursor(token, 'active:caption');
  assert.equal(parsed.id, 'tie-breaker');
  assert.equal(parsed.value.seconds, timestamp.seconds);
  assert.equal(parsed.value.nanoseconds, timestamp.nanoseconds);
  assert.throws(() => decodeCursor(token, 'removed:caption'), InvalidCursorError);
  assert.equal(decodeCursor(encodeCursor(document('zone-2', 'same zone'), 'name', 'zones'), 'zones').value, 'same zone');
});

test('invalid, oversized and ambiguous page links are rejected before a query is executed', () => {
  for (const token of ['', '!!!', 'a'.repeat(4097), Buffer.from('null').toString('base64url')]) {
    assert.throws(() => decodeCursor(token, 'scope'), InvalidCursorError);
  }
  const token = encodeCursor(document('valid-id', new Timestamp(12, 0)), 'created_at', 'scope');
  const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  for (const invalid of [{ ...payload, id: '../other' }, { ...payload, value: { type: 'timestamp', seconds: 12, nanoseconds: 1_000_000_000 } }]) {
    assert.throws(() => decodeCursor(Buffer.from(JSON.stringify(invalid)).toString('base64url'), 'scope'), InvalidCursorError);
  }
  assert.throws(() => pageCursors({ after: ['one', 'two'] }), InvalidCursorError);
  assert.throws(() => pageCursors({ after: 'one', before: 'two' }), InvalidCursorError);
  assert.throws(() => pageCursors({ postsAfter: 'one', postsBefore: 'two' }, 'posts'), InvalidCursorError);
});

test('navigation retains filters and the other inventory cursor without carrying conflicting boundaries', () => {
  const url = new URL(pageHref('/admin/search', { q: 'a & b', usersAfter: 'user-page', postsBefore: 'old-page' }, 'new-page', 'after', 'posts'), 'https://example.test');
  assert.equal(url.pathname, '/admin/search');
  assert.equal(url.searchParams.get('q'), 'a & b');
  assert.equal(url.searchParams.get('usersAfter'), 'user-page');
  assert.equal(url.searchParams.get('postsAfter'), 'new-page');
  assert.equal(url.searchParams.has('postsBefore'), false);
  const reset = new URL(pageHref('/admin/posts', { q: 'hello', status: 'active', after: 'old-page' }, null, 'after'), 'https://example.test');
  assert.equal(reset.searchParams.get('status'), 'active');
  assert.equal(reset.searchParams.has('after'), false);
});

test('query text accepts bounded scalar values and repeated parameters cannot become executable filters', () => {
  assert.equal(textParameter(['active', 'trash']), '');
  assert.equal(textParameter(undefined), '');
  assert.equal(textParameter('  abcdef ', 4), 'abcd');
});
