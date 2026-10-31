import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { supportBalanceTotal, supportCheckoutChannelAllowed, supportSplit, refundableWriterAmount, supportSettings, stripeSupportAmount, supportStripeKeyMatchesEnvironment } from '../lib/supportPolicy.js';
import { cryptoDecimal, cryptoPaymentFullyPaid, verifyCryptoIPN } from '../lib/supportCryptoPolicy.js';

test('writers receive 72% of gross, independently of the provider fee', () => {
  assert.deepEqual(supportSplit(100_000), { grossMilliunits: 100_000, writerMilliunits: 72_000,
    remainderMilliunits: 28_000, writerShareBps: 7200 });
  assert.equal(supportSplit(49_990).writerMilliunits, 35_992);
  for (const amount of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => supportSplit(amount));
});

test('restricted and standard Stripe keys stay in their matching payment environment', () => {
  for (const prefix of ['sk', 'rk']) {
    assert.equal(supportStripeKeyMatchesEnvironment(`${prefix}_test_fixture`, 'sandbox'), true);
    assert.equal(supportStripeKeyMatchesEnvironment(`${prefix}_live_fixture`, 'production'), true);
    assert.equal(supportStripeKeyMatchesEnvironment(`${prefix}_live_fixture`, 'sandbox'), false);
    assert.equal(supportStripeKeyMatchesEnvironment(`${prefix}_test_fixture`, 'production'), false);
  }
  assert.equal(supportStripeKeyMatchesEnvironment('pk_test_fixture', 'sandbox'), false);
});

test('partial refund totals conserve the original writer entitlement without rounding drift', () => {
  assert.equal(refundableWriterAmount(49_990, 49_990), 35_992);
  assert.equal(refundableWriterAmount(49_990, 0), 0);
  assert.equal(refundableWriterAmount(100_000, 25_000), 18_000);
  assert.throws(() => refundableWriterAmount(100_000, 100_001));
  assert.equal(stripeSupportAmount(4999, 'gbp'), 49_990);
  assert.throws(() => stripeSupportAmount(100, 'jpy'));
});

test('UK merchant is the default; payments stay off until explicitly configured', () => {
  const settings = supportSettings();
  assert.equal(settings.merchantCountry, 'GB');
  assert.equal(settings.stripeEnabled, false);
  assert.equal(settings.cryptoEnabled, false);
  assert.equal(settings.appleEnabled, false);
  assert.equal(supportSettings({ merchant_country: 'UK' }).merchantCountry, 'GB');
});

test('UK Stripe is allowed with approval; UK crypto uses an independent processor by default', () => {
  const configured = { enabled: true, environment: 'production', merchant_country: 'GB',
    stripe_enabled: true, merchant_approved: true, crypto_enabled: true, crypto_approved: true };
  assert.equal(supportSettings(configured).stripeEnabled, true);
  assert.equal(supportSettings(configured).cryptoEnabled, true);
  assert.equal(supportSettings({ ...configured, crypto_provider: 'stripe' }).cryptoEnabled, false);
  assert.equal(supportSettings({ ...configured, merchant_country: 'TR' }).stripeEnabled, false);
  assert.equal(supportSettings({ ...configured, merchant_country: 'TR' }).cryptoEnabled, false);
});

test('pending, confirmed, short and malformed crypto payments never count as finished funds', () => {
  const base = { payment_status: 'finished', pay_amount: '0.00000001', actually_paid: 1e-8 };
  assert.equal(cryptoPaymentFullyPaid(base), true);
  for (const status of ['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'failed', 'expired']) {
    assert.equal(cryptoPaymentFullyPaid({ ...base, payment_status: status }), false);
  }
  assert.equal(cryptoPaymentFullyPaid({ ...base, actually_paid: '0.000000009' }), false);
  assert.equal(cryptoPaymentFullyPaid({ ...base, actually_paid: 'not-money' }), false);
  assert.equal(cryptoDecimal('49.99', 3), 49_990n);
});

test('crypto callbacks require the canonical SHA512 signature including nested fields', () => {
  const body = { z: 2, a: { y: 3, x: 1 } }, secret = 'test-only-secret';
  const signature = createHmac('sha512', secret).update('{"a":{"x":1,"y":3},"z":2}').digest('hex');
  assert.equal(verifyCryptoIPN(body, signature, secret), true);
  assert.equal(verifyCryptoIPN({ ...body, z: 4 }, signature, secret), false);
  assert.equal(verifyCryptoIPN(body, signature, 'wrong'), false);
  assert.equal(verifyCryptoIPN(body, '', secret), false);
});

test('crypto decimal formatting may remove insignificant zeroes but must never round an underpayment up', () => {
  assert.equal(cryptoDecimal('1.9900', 3), 1990n);
  assert.equal(cryptoDecimal('0.000', 0), 0n);
  assert.throws(() => cryptoDecimal('1.9901', 3));
  assert.equal(cryptoPaymentFullyPaid({ payment_status: 'finished', pay_amount: '0.0000000100', actually_paid: '0.00000000999' }), false);
  assert.equal(verifyCryptoIPN(undefined, 'a'.repeat(128), 'secret'), false);
  let nested = {};
  for (let i = 0; i < 40; i++) nested = { child: nested };
  assert.equal(verifyCryptoIPN(nested, 'a'.repeat(128), 'secret'), false);
});

test('support totals fail closed on unsafe integers and impossible negative balances', () => {
  assert.equal(supportBalanceTotal(72000, -18000), 54000);
  assert.throws(() => supportBalanceTotal(10, -11));
  assert.throws(() => supportBalanceTotal(Number.MAX_SAFE_INTEGER, 1));
  assert.throws(() => supportBalanceTotal(NaN, 1));
});

test('changing a native payload to channel web cannot bypass the attested checkout channel', () => {
  const ios = '1:696514892783:ios:abcdef', web = '1:696514892783:web:abcdef';
  const settings = supportSettings({ enabled: true, external_ios_us_enabled: true, external_web_enabled: true, web_app_ids: [web] });
  assert.equal(supportCheckoutChannelAllowed(settings, 'ios', 'USA', ios), true);
  assert.equal(supportCheckoutChannelAllowed(settings, 'ios', 'TUR', ios), false);
  assert.equal(supportCheckoutChannelAllowed(settings, 'web', 'USA', ios), false);
  assert.equal(supportCheckoutChannelAllowed(settings, 'web', undefined, web), true);
  assert.equal(supportCheckoutChannelAllowed(settings, 'web', undefined, '1:696514892783:web:111111'), false);
  assert.equal(supportCheckoutChannelAllowed(settings, 'ios', 'USA', undefined), false);
  assert.equal(supportCheckoutChannelAllowed(supportSettings(), 'web', undefined, web), false);
});
