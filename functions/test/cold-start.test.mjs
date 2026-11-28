import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// index.ts loads every module in every function's cold start; these SDKs serve one or no deployed function.
test('loading the functions entry point leaves the heavy SDKs unloaded', () => {
  require('../lib/index.js');
  const loaded = Object.keys(require.cache);
  for (const sdk of ['@google-cloud/vision', 'node_modules/stripe/', '@apple/app-store-server-library']) {
    assert.equal(loaded.some(path => path.includes(sdk)), false, `${sdk} loaded at cold start`);
  }
});

test('the lazily loaded SDKs still resolve', async () => {
  const Stripe = await require('../lib/supportStripe.js').loadStripe();
  assert.equal(typeof Stripe.webhooks.constructEvent, 'function');
  const { Environment } = require('@apple/app-store-server-library');
  const { APPLE_ENVIRONMENT } = require('../lib/supportApple.js');
  assert.deepEqual(APPLE_ENVIRONMENT, { production: Environment.PRODUCTION, sandbox: Environment.SANDBOX });
});
