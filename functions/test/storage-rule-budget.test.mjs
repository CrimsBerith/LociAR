import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Storage permission expressions stay within the two-document Firestore lookup budget', () => {
  const rules = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
  const functions = new Map();
  for (const match of rules.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (; end < rules.length && depth; end++) {
      if (rules[end] === '{') depth++;
      else if (rules[end] === '}') depth--;
    }
    functions.set(match[1], rules.slice(start, end - 1));
  }
  function lookupCount(expression, visited = new Set()) {
    let reads = [...expression.matchAll(/firestore\.(?:get|exists)\s*\(/g)].length;
    for (const match of expression.matchAll(/\b(\w+)\s*\(/g)) {
      if (!functions.has(match[1]) || visited.has(match[1])) continue;
      visited.add(match[1]);
      reads += lookupCount(functions.get(match[1]), visited);
    }
    return reads;
  }
  let checked = 0;
  for (const match of rules.matchAll(/allow\s+([^:]+):\s*if\s*([^;]+);/g)) {
    checked++;
    assert.ok(lookupCount(match[2]) <= 2, `${match[1].trim()} exceeds Storage's two-document budget`);
  }
  assert.ok(checked > 10, 'permission coverage is complete');
});
