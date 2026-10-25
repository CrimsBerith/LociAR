import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPPORT_STRIPE_WEBHOOK_SECRET = 'test-only-webhook-signing-secret';
const { supportStripeWebhook } = await import('../lib/supportStripe.js');
const { db } = await import('../lib/core.js');

test('invalid Stripe signatures are rejected before any database access or API-key lookup', async () => {
  const original = db.collection;
  let reads = 0, status;
  db.collection = () => { reads++; throw new Error('Unauthenticated database access'); };
  const response = { status(code) { status = code; return this; }, send() {}, end() {} };
  try {
    await supportStripeWebhook({ method: 'POST', rawBody: Buffer.from('{}'), header: () => 'invalid-signature' }, response);
    assert.equal(status, 400);
    assert.equal(reads, 0);
  } finally { db.collection = original; }
});
