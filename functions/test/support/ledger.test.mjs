import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
const { db, Timestamp } = await import('../../lib/core.js');
const { createSupportIntent, expireSupportIntent, claimCryptoInvoiceCreation } = await import('../../lib/supportAccess.js');
const { readSupportReceipt } = await import('../../lib/supportReads.js');
const { createStripeSupportCheckout } = await import('../../lib/supportStripe.js');
const { creditSupport, reverseSupport, eraseSupportAccountLinks } = await import('../../lib/supportLedger.js');
const { supportSettings } = await import('../../lib/supportPolicy.js');
after(() => db.terminate());

async function fixture(provider = 'stripe', environment = 'sandbox') {
  const buyer = randomUUID(), author = randomUUID(), post = randomUUID();
  await Promise.all([db.collection('profiles').doc(buyer).set({ suspended: false }),
    db.collection('profiles').doc(author).set({ suspended: false }),
    db.collection('posts').doc(post).set({ creator_id: author, status: 'active', visibility: 'public', is_anonymous: true })]);
  const caller = { luid: buyer, uid: buyer, email: null, emailVerified: true, provider: 'password',
    isAppleUser: false, isAnonymous: false, adminRole: null };
  const productId = 'com.khankartal.lociar.support.small';
  const data = { postId: post, productId };
  const settings = supportSettings({ environment });
  const intent = await createSupportIntent(caller, data, provider, settings);
  const payment = { id: `test_${randomUUID().replaceAll('-', '')}`, intentId: intent.intentId, provider,
    environment, productId, grossMilliunits: 100_000, currency: 'GBP', purchasedAt: Date.now() };
  const balance = db.collection('support_balances').doc(`${author}_GBP_${environment}`);
  return { buyer, author, post, caller, data, settings, intent, payment, balance };
}

test('concurrent and replayed successful payments credit exactly once', async () => {
  const f = await fixture();
  await Promise.all(Array.from({ length: 5 }, () => creditSupport(f.payment, f.buyer)));
  assert.equal((await f.balance.get()).get('pending_milliunits'), 72_000);
  await assert.rejects(creditSupport({ ...f.payment, grossMilliunits: 50_000 }, f.buyer));
  await assert.rejects(creditSupport(f.payment, f.author));
});

test('wrong amount, product, provider and environment are rejected before money is credited', async () => {
  const f = await fixture();
  await db.collection('support_intents').doc(f.intent.intentId).update({ gross_milliunits: 100_000, currency: 'GBP' });
  for (const change of [{ grossMilliunits: 100_010 }, { currency: 'USD' }, { provider: 'crypto' },
    { environment: 'production' }, { productId: 'unknown' }]) await assert.rejects(creditSupport({ ...f.payment, ...change }));
  assert.equal((await f.balance.get()).exists, false);
});

test('partial/full refunds remain monotonic and idempotent regardless of event order', async () => {
  const f = await fixture();
  await creditSupport(f.payment);
  await reverseSupport(f.payment.id, 25_000);
  assert.equal((await f.balance.get()).get('pending_milliunits'), 54_000);
  await Promise.all([reverseSupport(f.payment.id, 100_000), reverseSupport(f.payment.id, 25_000)]);
  await creditSupport(f.payment);
  assert.equal((await f.balance.get()).get('pending_milliunits'), 0);
  assert.equal((await db.collection('support_payments').doc(f.payment.id).get()).get('status'), 'refunded');
});

test('refund arriving before fulfillment never creates spendable writer credit', async () => {
  const f = await fixture('crypto');
  await reverseSupport(f.payment.id, 100_000);
  const receipt = await creditSupport(f.payment);
  assert.equal(receipt.status, 'refunded');
  assert.equal((await f.balance.get()).get('pending_milliunits'), 0);
});

test('anonymous support ignores identity blocks but respects the independent note mute', async () => {
  const f = await fixture();
  await db.collection('user_blocks').doc(`${f.buyer}_${f.author}`).set({ blocker_id: f.buyer, blocked_id: f.author });
  const response = await createSupportIntent(f.caller, f.data, 'stripe', f.settings);
  assert.deepEqual(Object.keys(response).sort(), ['intentId', 'productId']);
  assert.equal(JSON.stringify(response).includes(f.author), false);
  await db.collection('anonymous_blocks').doc(`${f.buyer}_${f.author}`).set({ blocker_id: f.buyer, blocked_id: f.author });
  await assert.rejects(createSupportIntent(f.caller, f.data, 'stripe', f.settings));
});

test('location notes require the server read grant, not a payment or forged missing expiry', async () => {
  const f = await fixture();
  await db.collection('posts').doc(f.post).update({ note_kind: 'location' });
  await assert.rejects(createSupportIntent(f.caller, f.data, 'stripe', f.settings));
  const grant = db.collection('dense_spot_unlocks').doc(`${f.buyer}_note_${f.post}`);
  await grant.set({ owner_luid: f.buyer });
  await assert.rejects(createSupportIntent(f.caller, f.data, 'stripe', f.settings));
  await grant.set({ owner_luid: f.buyer, expires_at: Timestamp.fromMillis(Date.now() + 60_000) });
  await createSupportIntent(f.caller, f.data, 'stripe', f.settings);
});

test('sandbox and production money stay in separate balances', async () => {
  const f = await fixture(); await creditSupport(f.payment);
  const next = await createSupportIntent(f.caller, f.data, 'stripe', supportSettings({ environment: 'production' }));
  await creditSupport({ ...f.payment, id: `test_${randomUUID().replaceAll('-', '')}`, intentId: next.intentId, environment: 'production' });
  assert.equal((await f.balance.get()).get('pending_milliunits'), 72_000);
  assert.equal((await db.collection('support_balances').doc(`${f.author}_GBP_production`).get()).get('pending_milliunits'), 72_000);
});

test('account deletion removes identity links and refund replay cannot recreate deleted balances', async () => {
  const f = await fixture(); await creditSupport(f.payment);
  await db.collection('account_deletion_jobs').doc(f.author).set({ status: 'done' });
  await eraseSupportAccountLinks(f.author);
  await f.balance.delete();
  await reverseSupport(f.payment.id, 100_000);
  assert.equal((await f.balance.get()).exists, false);
  assert.equal((await db.collection('support_payments').doc(f.payment.id).get()).get('author_luid'), null);
  await eraseSupportAccountLinks(f.buyer);
  assert.equal((await db.collection('support_payments').doc(f.payment.id).get()).get('buyer_luid'), null);
});

test('racing checkout retries reuse one private pending intent across processor calls and app restarts', async () => {
  const f = await fixture();
  const retries = await Promise.all(Array.from({ length: 6 }, () => createSupportIntent(f.caller, f.data, 'stripe', f.settings)));
  assert.ok(retries.every(item => item.intentId === f.intent.intentId));
  const recovered = await readSupportReceipt(f.caller, { postId: f.post });
  assert.equal(recovered.intentId, f.intent.intentId);
  assert.equal(recovered.status, 'awaiting_payment');
  assert.equal(JSON.stringify(recovered).includes(f.author), false);
  assert.equal(JSON.stringify(recovered).includes(f.post), false);
  await assert.rejects(createSupportIntent(f.caller, f.data, 'crypto', f.settings));
  await assert.rejects(createSupportIntent(f.caller, { ...f.data, productId: 'com.khankartal.lociar.support.large' }, 'stripe', f.settings));
  await assert.rejects(readSupportReceipt({ ...f.caller, luid: f.author }, { intentId: f.intent.intentId }));
});

test('an elapsed local timeout never unlocks an uncertain payment; provider-confirmed expiry does', async () => {
  const f = await fixture();
  await db.collection('support_intents').doc(f.intent.intentId).update({ expires_at: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await createSupportIntent(f.caller, f.data, 'stripe', f.settings)).intentId, f.intent.intentId);
  await expireSupportIntent(f.intent.intentId);
  assert.equal((await readSupportReceipt(f.caller, { intentId: f.intent.intentId })).status, 'expired');
  assert.equal((await readSupportReceipt(f.caller, { postId: f.post })).status, 'none');
  assert.notEqual((await createSupportIntent(f.caller, f.data, 'stripe', f.settings)).intentId, f.intent.intentId);
});

test('a deliberate next donation replaces a settled reference and late expiry cannot erase it', async () => {
  const f = await fixture();
  await creditSupport(f.payment);
  const next = await createSupportIntent(f.caller, { ...f.data, previousIntentId: f.intent.intentId }, 'stripe', f.settings);
  assert.notEqual(next.intentId, f.intent.intentId);
  await expireSupportIntent(f.intent.intentId);
  assert.equal((await readSupportReceipt(f.caller, { postId: f.post })).intentId, next.intentId);
  assert.equal((await readSupportReceipt(f.caller, { intentId: f.intent.intentId })).status, 'pending');
});

test('payment completed while the app is closed remains recoverable and late request retries cannot buy again', async () => {
  const f = await fixture();
  await creditSupport(f.payment);
  const recovered = await readSupportReceipt(f.caller, { postId: f.post });
  assert.equal(recovered.status, 'pending');
  assert.equal(recovered.intentId, f.intent.intentId);
  assert.equal(JSON.stringify(recovered).includes(f.author), false);
  for (const previousIntentId of [undefined, randomUUID()]) {
    const retry = await createSupportIntent(f.caller, { ...f.data, previousIntentId }, 'stripe', f.settings);
    assert.equal(retry.intentId, f.intent.intentId);
  }
  await assert.rejects(createSupportIntent(f.caller, { ...f.data, productId: 'com.khankartal.lociar.support.large' }, 'stripe', f.settings));
  const repeatData = { ...f.data, previousIntentId: f.intent.intentId };
  const repeats = await Promise.all(Array.from({ length: 6 }, () => createSupportIntent(f.caller, repeatData, 'stripe', f.settings)));
  const next = repeats[0];
  assert.ok(repeats.every(item => item.intentId === next.intentId));
  await creditSupport({ ...f.payment, id: `test_${randomUUID().replaceAll('-', '')}`, intentId: next.intentId });
  assert.equal((await createSupportIntent(f.caller, repeatData, 'stripe', f.settings)).intentId, next.intentId);
  assert.equal((await f.balance.get()).get('pending_milliunits'), 144_000);
  assert.equal((await db.collection('support_intents').where('buyer_luid', '==', f.buyer).get()).size, 2);
});

test('refund remains visible through the post recovery reference', async () => {
  const f = await fixture();
  await creditSupport(f.payment);
  await reverseSupport(f.payment.id, f.payment.grossMilliunits);
  const recovered = await readSupportReceipt(f.caller, { postId: f.post });
  assert.equal(recovered.status, 'refunded');
  assert.equal(recovered.intentId, f.intent.intentId);
});

test('only one NOWPayments invoice POST may start when the provider response is uncertain', async () => {
  const f = await fixture('crypto');
  await db.collection('support_intents').doc(f.intent.intentId).update({ crypto_processor: 'nowpayments' });
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimCryptoInvoiceCreation(f.intent.intentId)));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await claimCryptoInvoiceCreation(f.intent.intentId), false);
});

test('Stripe retries use the original quote, expiry and idempotency key even with concurrent stale snapshots', async () => {
  const f = await fixture();
  const ref = db.collection('support_intents').doc(f.intent.intentId);
  await ref.update({ stripe_price_id: 'price_FrozenSmall', gross_milliunits: 1990, currency: 'GBP' });
  const saved = await ref.get(), calls = [];
  const stripe = { checkout: { sessions: { create: async (params, options) => {
    calls.push({ params, options });
    return { id: 'cs_test_frozen', url: 'https://checkout.stripe.com/c/pay/test-frozen' };
  } } } };
  await Promise.all([createStripeSupportCheckout(stripe, saved), createStripeSupportCheckout(stripe, saved)]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].params.line_items[0].price, 'price_FrozenSmall');
  assert.equal(calls[0].params.expires_at, Math.floor(saved.get('expires_at').toMillis() / 1000));
  assert.equal(calls[0].options.idempotencyKey, `loci-support-${f.intent.intentId}`);
  assert.equal((await readSupportReceipt(f.caller, { postId: f.post })).url, 'https://checkout.stripe.com/c/pay/test-frozen');
});

test('an uncertain old Stripe creation never starts another session after the safe recovery window', async () => {
  const f = await fixture(), ref = db.collection('support_intents').doc(f.intent.intentId);
  await ref.update({ stripe_price_id: 'price_FrozenSmall', expires_at: Timestamp.fromMillis(Date.now() + 1000) });
  const stripe = { checkout: { sessions: { create: async () => { throw new Error('Must not call Stripe'); } } } };
  await assert.rejects(createStripeSupportCheckout(stripe, await ref.get()), /reconciliation/);
});

test('pending receipts remain readable while a disabled method removes native resume permission', async () => {
  const f = await fixture(), ref = db.collection('system').doc('post_support');
  try {
    await ref.set({ enabled: true, stripe_enabled: true, external_ios_us_enabled: true, environment: 'sandbox' });
    assert.equal((await readSupportReceipt(f.caller, { postId: f.post })).externalIOSAllowed, true);
    await ref.update({ stripe_enabled: false });
    const receipt = await readSupportReceipt(f.caller, { intentId: f.intent.intentId });
    assert.equal(receipt.externalIOSAllowed, false);
    assert.equal(receipt.status, 'awaiting_payment');
  } finally { await ref.delete(); }
});
