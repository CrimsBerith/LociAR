import { defineSecret } from 'firebase-functions/params';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { CALLABLE_MAX_INSTANCES, db, ENFORCE_APP_CHECK, HttpsError, requireCaller } from './core';
import { loadSupportSettings } from './supportStripe';
import { claimCryptoInvoiceCreation, createSupportIntent } from './supportAccess';
import { creditSupport, reverseSupport } from './supportLedger';
import { cryptoDecimal, cryptoPaymentFullyPaid, verifyCryptoIPN } from './supportCryptoPolicy';
import { supportCheckoutChannelAllowed, type SupportSettings } from './supportPolicy';

const SUPPORT_CRYPTO_API_KEY = defineSecret('SUPPORT_CRYPTO_API_KEY');
const SUPPORT_CRYPTO_IPN_SECRET = defineSecret('SUPPORT_CRYPTO_IPN_SECRET');
const baseURL = (settings: SupportSettings) => settings.environment === 'production'
  ? 'https://api.nowpayments.io/v1' : 'https://api-sandbox.nowpayments.io/v1';
async function cryptoAPI(settings: SupportSettings, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(baseURL(settings) + path, { method: body ? 'POST' : 'GET',
    headers: { 'x-api-key': SUPPORT_CRYPTO_API_KEY.value(), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Crypto provider unavailable');
  return await response.json() as Record<string, unknown>;
}

export const beginCryptoPostSupport = onCall({ enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: CALLABLE_MAX_INSTANCES,
  secrets: [SUPPORT_CRYPTO_API_KEY] }, async request => {
  const settings = await loadSupportSettings(), data = (request.data ?? {}) as Record<string, unknown>;
  if (!settings.cryptoEnabled || settings.cryptoProvider !== 'nowpayments') throw new HttpsError('failed-precondition', 'Crypto support is unavailable');
  if (!supportCheckoutChannelAllowed(settings, data.channel, data.storefront, request.app?.appId)) {
    throw new HttpsError('permission-denied', 'External checkout is unavailable in this storefront');
  }
  const offer = settings.cryptoOffers.find(item => item.productId === data.productId);
  if (!offer) throw new HttpsError('invalid-argument', 'Invalid support product');
  const intent = await createSupportIntent(requireCaller(request), data, 'crypto', settings, {
    gross_milliunits: offer.grossMilliunits, currency: offer.currency, crypto_processor: 'nowpayments',
  });
  const ref = db.collection('support_intents').doc(intent.intentId);
  const saved = await ref.get();
  if (saved.get('checkout_url')) return { intentId: saved.id, url: saved.get('checkout_url') };
  if (!await claimCryptoInvoiceCreation(intent.intentId)) throw new HttpsError('failed-precondition', 'Check the pending support payment first');
  const returnURL = 'https://us-central1-lociar-2f38c.cloudfunctions.net/supportCheckoutReturn';
  const invoice = await cryptoAPI(settings, '/invoice', {
    price_amount: saved.get('gross_milliunits') / 1000, price_currency: saved.get('currency').toLowerCase(),
    order_id: intent.intentId, order_description: 'LociAR writer support',
    ipn_callback_url: 'https://us-central1-lociar-2f38c.cloudfunctions.net/supportCryptoWebhook',
    success_url: returnURL, cancel_url: returnURL,
    is_fee_paid_by_user: false, is_fixed_rate: true,
  });
  const url = typeof invoice.invoice_url === 'string' ? new URL(invoice.invoice_url) : null;
  if (!url || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !['nowpayments.io', 'payment.nowpayments.io'].includes(url.hostname)
      || (typeof invoice.id === 'number' && !Number.isSafeInteger(invoice.id))
      || !/^\d{1,64}$/.test(String(invoice.id))) throw new Error('Invalid crypto checkout');
  await ref.update({ crypto_invoice_id: String(invoice.id), checkout_url: url.toString() });
  return { intentId: intent.intentId, url: url.toString() };
});

/** Signed IPN + authenticated provider lookup + exact invoice/amount binding. No transaction-hash claims. */
export const supportCryptoWebhook = onRequest({ maxInstances: CALLABLE_MAX_INSTANCES,
  secrets: [SUPPORT_CRYPTO_API_KEY, SUPPORT_CRYPTO_IPN_SECRET] }, async (request, response) => {
  if (request.method !== 'POST') { response.status(405).end(); return; }
  if (request.rawBody.length > 100_000 || !verifyCryptoIPN(request.body,
    request.header('x-nowpayments-sig'), SUPPORT_CRYPTO_IPN_SECRET.value())) { response.status(400).end(); return; }
  const paymentID = String(request.body?.payment_id);
  if (!/^\d{1,64}$/.test(paymentID)) { response.status(400).end(); return; }
  try {
    const settings = await loadSupportSettings();
    const payment = await cryptoAPI(settings, `/payment/${paymentID}`);
    const intentId = String(payment.order_id), intent = await db.collection('support_intents').doc(intentId).get();
    if (!intent.exists || intent.get('provider') !== 'crypto' || intent.get('crypto_processor') !== 'nowpayments'
        || String(payment.invoice_id) !== intent.get('crypto_invoice_id')
        || intent.get('environment') !== settings.environment) throw new Error('Invalid crypto invoice');
    const gross = Number(intent.get('gross_milliunits'));
    if (cryptoDecimal(payment.price_amount, 3) !== BigInt(gross)
        || String(payment.price_currency).toUpperCase() !== intent.get('currency')) throw new Error('Crypto amount mismatch');
    if (payment.payment_status === 'refunded') await reverseSupport(`nowpayments_${paymentID}`, gross);
    else if (cryptoPaymentFullyPaid(payment)) {
      const purchasedAt = Date.parse(String(payment.created_at));
      if (!Number.isFinite(purchasedAt) || purchasedAt > Date.now() + 60_000) throw new Error('Invalid payment time');
      await creditSupport({ id: `nowpayments_${paymentID}`, intentId, provider: 'crypto', environment: settings.environment,
        productId: intent.get('product_id'), grossMilliunits: gross, currency: intent.get('currency'), purchasedAt });
    }
    response.status(200).send('OK');
  } catch { response.status(503).send('Retry'); }
});
