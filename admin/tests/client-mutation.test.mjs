import assert from 'node:assert/strict';
import test from 'node:test';
import { createMutationClient } from '../lib/client-mutation.ts';

test('interrupted requests retain their key and changed input creates a distinct operation', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (_path, options) => {
    calls.push(options);
    if (calls.length === 1) throw new Error('connection lost after commit');
    return Response.json({ ok: true });
  };
  try {
    const client = createMutationClient();
    await assert.rejects(client.post('/mutation', { value: 1 }), /Retry.*same operation/);
    assert.equal((await client.post('/mutation', { value: 1 })).response.status, 200);
    assert.equal(calls[0].headers['idempotency-key'], calls[1].headers['idempotency-key']);
    await client.post('/mutation', { value: 2 });
    assert.notEqual(calls[1].headers['idempotency-key'], calls[2].headers['idempotency-key']);
    client.clear(); await client.post('/mutation', { value: 2 });
    assert.notEqual(calls[2].headers['idempotency-key'], calls[3].headers['idempotency-key']);
  } finally { globalThis.fetch = original; }
});

test('a non-JSON gateway response can be retried with the same key; malformed JSON objects are rejected', async () => {
  const original = globalThis.fetch; const keys = []; let count = 0;
  globalThis.fetch = async (_path, options) => {
    keys.push(options.headers['idempotency-key']); count++;
    if (count === 1) return new Response('<html>gateway unavailable</html>', { status: 502 });
    if (count === 2) return Response.json([]);
    return Response.json({ error: 'MFA required' }, { status: 403 });
  };
  try {
    const client = createMutationClient();
    await assert.rejects(client.post('/mutation', {}), /response could not be confirmed/);
    await assert.rejects(client.post('/mutation', {}), /response could not be confirmed/);
    const result = await client.post('/mutation', {});
    assert.equal(result.response.status, 403); assert.equal(result.result.error, 'MFA required');
    assert.equal(new Set(keys).size, 1);
  } finally { globalThis.fetch = original; }
});
