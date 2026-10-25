import Stripe from 'stripe';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, HttpsError, isUUID, logger, requireCaller } from './core';
import { createSupportIntent, expireSupportIntent, requireSupportRefresh } from './supportAccess';
import { readSupportReceipt } from './supportReads';
import { creditSupport, reverseSupport } from './supportLedger';
import { stripeSupportAmount, supportCheckoutChannelAllowed, supportSettings, supportStripeKeyMatchesEnvironment, type SupportSettings, type SupportProvider } from './supportPolicy';

export const SUPPORT_STRIPE_SECRET_KEY = defineSecret('SUPPORT_STRIPE_SECRET_KEY');
const SUPPORT_STRIPE_WEBHOOK_SECRET = defineSecret('SUPPORT_STRIPE_WEBHOOK_SECRET');
const options = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES, secrets: [SUPPORT_STRIPE_SECRET_KEY] };

export async function loadSupportSettings() {
  return supportSettings((await db.collection('system').doc('post_support').get()).data());
}

function stripeClient(settings: SupportSettings) {
  const key = SUPPORT_STRIPE_SECRET_KEY.value();
  if (!supportStripeKeyMatchesEnvironment(key, settings.environment)) throw new HttpsError('failed-precondition', 'Payment environment is not configured');
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 10_000 });
}

export async function supportPrices(settings: SupportSettings) {
  if (!settings.stripeEnabled) return [];
  const stripe = stripeClient(settings);
  return Promise.all(Object.entries(settings.stripePrices).map(async ([productId, priceId]) => {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.type !== 'one_time' || price.billing_scheme !== 'per_unit'
        || price.livemode !== (settings.environment === 'production')) throw new Error('Invalid configured support price');
    return { productId, priceId, currency: price.currency.toUpperCase(),
      grossMilliunits: stripeSupportAmount(price.unit_amount, price.currency) };
  }));
}

let catalogPriceCache: { key: string; expires: number; value: Promise<Awaited<ReturnType<typeof supportPrices>>> } | undefined;
function catalogPrices(settings: SupportSettings) {
  if (!settings.stripeEnabled) return Promise.resolve([]);
  const key = JSON.stringify([settings.environment, settings.stripePrices]);
  if (!catalogPriceCache || catalogPriceCache.key !== key || catalogPriceCache.expires <= Date.now()) {
    const entry = { key, expires: Date.now() + 30_000, value: supportPrices(settings) };
    catalogPriceCache = entry;
    void entry.value.catch(() => { if (catalogPriceCache === entry) catalogPriceCache = undefined; });
  }
  return catalogPriceCache.value;
}

export const beginExternalPostSupport = onCall(options, async request => {
  const caller = requireCaller(request), data = (request.data ?? {}) as Record<string, unknown>;
  const settings = await loadSupportSettings();
  const provider: SupportProvider = data.provider === 'crypto' ? 'crypto' : 'stripe';
  if (!['stripe', 'crypto'].includes(String(data.provider))
      || !(provider === 'crypto' ? settings.cryptoEnabled && settings.cryptoProvider === 'stripe' : settings.stripeEnabled)) {
    throw new HttpsError('failed-precondition', 'This payment method is not available');
  }
  // The app additionally checks Storefront.current. Web callers must never impersonate an iOS storefront.
  if (!supportCheckoutChannelAllowed(settings, data.channel, data.storefront, request.app?.appId)) {
    throw new HttpsError('permission-denied', 'External checkout is unavailable in this storefront');
  }
  const stripe = stripeClient(settings);
  if (settings.environment === 'production') {
    const account = await stripe.accounts.retrieveCurrent();
    if (account.country !== settings.merchantCountry || !account.charges_enabled || !account.details_submitted) {
      throw new HttpsError('failed-precondition', 'Merchant account is not ready');
    }
  }
  const prices = await supportPrices(settings), price = prices.find(p => p.productId === data.productId);
  if (!price || (provider === 'crypto' && price.currency !== 'USD')) throw new HttpsError('invalid-argument', 'Unavailable support price');
  const intent = await createSupportIntent(caller, data, provider, settings, {
    gross_milliunits: price.grossMilliunits, currency: price.currency, stripe_price_id: price.priceId,
  });
  const intentRef = db.collection('support_intents').doc(intent.intentId);
  const saved = await intentRef.get();
  if (saved.get('crypto_processor') === 'nowpayments' || !saved.get('stripe_price_id')) {
    throw new HttpsError('already-exists', 'Check the original support payment first');
  }
  if (saved.get('checkout_session_id')) {
    await reconcileStripeSupport(stripe, saved.id, saved.get('checkout_session_id'), settings);
    const receipt = await readSupportReceipt(caller, { intentId: saved.id });
    if (receipt.status !== 'awaiting_payment' || !saved.get('checkout_url')) {
      throw new HttpsError('already-exists', 'Check the support payment status');
    }
    return { intentId: saved.id, url: saved.get('checkout_url') };
  }
  return createStripeSupportCheckout(stripe, saved);
});

/** Frozen quote, expiry and idempotency key also recover a lost provider response without a new purchase. */
export async function createStripeSupportCheckout(stripe: Stripe, saved: DocumentSnapshot) {
  if (saved.get('crypto_processor') === 'nowpayments' || !saved.get('stripe_price_id')) throw new Error('Wrong payment processor');
  if (saved.get('checkout_session_id') && saved.get('checkout_url')) return { intentId: saved.id, url: saved.get('checkout_url') };
  const expires = saved.get('expires_at').toMillis() / 1000;
  // Stripe retains idempotency keys for at least 24 hours. Never recreate an uncertain old checkout.
  if (expires < Date.now() / 1000 + 30 * 60) {
    throw new HttpsError('failed-precondition', 'Support creation needs reconciliation');
  }
  const returnURL = 'https://us-central1-lociar-2f38c.cloudfunctions.net/supportCheckoutReturn';
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment', line_items: [{ price: saved.get('stripe_price_id'), quantity: 1 }],
    branding_settings: { display_name: 'LociAR' },
    adaptive_pricing: { enabled: false }, allow_promotion_codes: false,
    client_reference_id: saved.id, metadata: { support_intent: saved.id },
    payment_intent_data: { metadata: { support_intent: saved.id } },
    // Omission lets Stripe choose the available cards, wallets and local methods. No forced 3DS.
    ...(saved.get('provider') === 'crypto' ? { allowed_payment_method_types: ['crypto'] as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[] }
      : { excluded_payment_method_types: ['crypto'] }),
    success_url: returnURL, cancel_url: returnURL, locale: 'auto',
    expires_at: Math.floor(expires),
  }, { idempotencyKey: `loci-support-${saved.id}` });
  const url = checkout.url ? new URL(checkout.url) : null;
  if (!url || url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com'
      || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Invalid checkout URL');
  await saved.ref.update({ checkout_session_id: checkout.id, checkout_url: checkout.url });
  return { intentId: saved.id, url: checkout.url! };
}

/** Read the authoritative session AND PaymentIntent; a browser redirect is never proof of payment. */
export async function fulfillSupportCheckout(stripe: Stripe, sessionId: string, settings: SupportSettings,
  retrieved?: Stripe.Checkout.Session) {
  const session = retrieved ?? await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  const id = session.metadata?.support_intent;
  if (!isUUID(id) || session.id !== sessionId || session.client_reference_id !== id || session.mode !== 'payment') return;
  const intent = await db.collection('support_intents').doc(id).get();
  if (!intent.exists || !['stripe', 'crypto'].includes(intent.get('provider'))
      || intent.get('crypto_processor') === 'nowpayments') return;
  if (session.livemode !== (settings.environment === 'production')) throw new Error('Wrong Stripe environment');
  if (session.payment_status !== 'paid') return;
  const pi = session.payment_intent;
  if (!pi || typeof pi === 'string' || pi.status !== 'succeeded' || pi.metadata.support_intent !== id
      || pi.amount_received !== session.amount_total || pi.currency !== session.currency) throw new Error('Unconfirmed support payment');
  if (intent.get('checkout_session_id') && intent.get('checkout_session_id') !== session.id) throw new Error('Checkout mismatch');
  const grossMilliunits = stripeSupportAmount(session.amount_total, session.currency);
  // Refunds can beat the completed event. Fetch the current charge so replay cannot restore refunded earnings.
  if (pi.latest_charge) {
    const charge = await stripe.charges.retrieve(typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id);
    const refunded = charge.disputed ? charge.amount : charge.amount_refunded;
    if (refunded > 0) await reverseSupport(`stripe_${pi.id}`, stripeSupportAmount(refunded, charge.currency));
  }
  await creditSupport({ id: `stripe_${pi.id}`, intentId: id, provider: intent.get('provider'),
    environment: session.livemode ? 'production' : 'sandbox', productId: intent.get('product_id'),
    grossMilliunits, currency: String(session.currency).toUpperCase(), purchasedAt: session.created * 1000 });
}

async function reconcileStripeSupport(stripe: Stripe, intentId: string, sessionId: string, settings: SupportSettings) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  if (session.metadata?.support_intent !== intentId || session.client_reference_id !== intentId
      || session.livemode !== (settings.environment === 'production')) throw new Error('Checkout mismatch');
  if (session.payment_status === 'paid') await fulfillSupportCheckout(stripe, sessionId, settings, session);
  // An async payment in progress is not an expired unpaid checkout, even after the local timer.
  else if (session.status === 'expired' && session.payment_status === 'unpaid'
      && (!session.payment_intent || (typeof session.payment_intent !== 'string' && session.payment_intent.status === 'canceled'))) {
    await expireSupportIntent(intentId);
  }
}

export const refreshStripePostSupport = onCall(options, async request => {
  const caller = requireCaller(request), intent = await requireSupportRefresh(caller, request.data?.intentId);
  if (!['stripe', 'crypto'].includes(intent.get('provider')) || intent.get('crypto_processor') === 'nowpayments') {
    throw new HttpsError('invalid-argument', 'Wrong payment processor');
  }
  const settings = await loadSupportSettings();
  if (intent.get('environment') !== settings.environment) throw new HttpsError('failed-precondition', 'Wrong payment environment');
  if (intent.get('checkout_session_id')) {
    await reconcileStripeSupport(stripeClient(settings), intent.id, intent.get('checkout_session_id'), settings);
  } else if (intent.get('stripe_price_id') && intent.get('expires_at').toMillis() >= Date.now() + 30 * 60_000) {
    await createStripeSupportCheckout(stripeClient(settings), intent);
  }
  return readSupportReceipt(caller, { intentId: intent.id });
});

export const supportStripeWebhook = onRequest({ maxInstances: CALLABLE_MAX_INSTANCES,
  secrets: [SUPPORT_STRIPE_SECRET_KEY, SUPPORT_STRIPE_WEBHOOK_SECRET] }, async (request, response) => {
  if (request.method !== 'POST') { response.status(405).end(); return; }
  const signature = request.header('stripe-signature');
  if (!signature || request.rawBody.length > 1_000_000) { response.status(400).end(); return; }
  let event: Stripe.Event;
  try { event = Stripe.webhooks.constructEvent(request.rawBody, signature, SUPPORT_STRIPE_WEBHOOK_SECRET.value()); }
  catch { response.status(400).send('Invalid signature'); return; }
  try {
    const settings = await loadSupportSettings(), stripe = stripeClient(settings);
    if (event.livemode !== (settings.environment === 'production')) { response.status(400).end(); return; }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await fulfillSupportCheckout(stripe, event.data.object.id, settings);
    } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
      const chargeId = event.type === 'charge.refunded' ? event.data.object.id : event.data.object.charge;
      const charge = await stripe.charges.retrieve(typeof chargeId === 'string' ? chargeId : chargeId.id);
      if (charge.metadata.support_intent && charge.payment_intent) {
        const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
        const refunded = event.type === 'charge.dispute.created' ? charge.amount : charge.amount_refunded;
        if (refunded > 0) await reverseSupport(`stripe_${pi}`, stripeSupportAmount(refunded, charge.currency));
      }
    }
    response.status(200).send('OK');
  } catch { response.status(503).send('Retry'); }
});

export const readSupportCatalog = onCall(options, async request => {
  requireCaller(request);
  const settings = await loadSupportSettings();
  let offers: Awaited<ReturnType<typeof supportPrices>> = [];
  try { offers = await catalogPrices(settings); }
  catch { logger.warn('post_support_prices_unavailable'); }
  return { writerShareBps: 7200, appleEnabled: settings.appleEnabled, stripeEnabled: settings.stripeEnabled && offers.length > 0,
    cryptoEnabled: settings.cryptoEnabled, externalIOSAllowed: settings.allowExternalIOS,
    environment: settings.environment, cryptoProvider: settings.cryptoProvider,
    offers, cryptoOffers: settings.cryptoOffers };
});
