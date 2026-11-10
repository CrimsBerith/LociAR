/** Owner decision: the writer receives 72% of the customer's gross support payment. */
export const WRITER_SHARE_BPS = 7200;
export function supportBalanceTotal(current: number, delta: number): number {
  const total = current + delta;
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(delta)
      || !Number.isSafeInteger(total) || total < 0) throw new Error('Support balance reconciliation required');
  return total;
}
export type SupportProvider = 'apple' | 'stripe' | 'crypto';
export type SupportEnvironment = 'production' | 'sandbox';
/** Prefer least-privilege restricted keys; never mix test and live credentials. */
export function supportStripeKeyMatchesEnvironment(key: string, environment: SupportEnvironment): boolean {
  const mode = environment === 'production' ? 'live' : 'test';
  return key.startsWith(`sk_${mode}_`) || key.startsWith(`rk_${mode}_`);
}
export type SupportSettings = {
  enabled: boolean; environment: SupportEnvironment; merchantCountry: string;
  appleEnabled: boolean; stripeEnabled: boolean; cryptoEnabled: boolean;
  appleId: number; allowExternalIOS: boolean; allowExternalWeb: boolean; webAppIDs: string[]; stripePrices: Record<string, string>;
  cryptoProvider: 'stripe' | 'nowpayments'; cryptoOffers: Array<{ productId: string; currency: string; grossMilliunits: number }>;
};

/** Server-owned switches; missing configuration never exposes a live checkout. */
export function supportSettings(data: Record<string, unknown> = {}): SupportSettings {
  const enabled = data.enabled === true;
  const environment = data.environment === 'production' ? 'production' : 'sandbox';
  const country = typeof data.merchant_country === 'string' ? data.merchant_country.toUpperCase() : 'GB';
  const merchantCountry = country === 'UK' ? 'GB' : country;
  const cryptoProvider = data.crypto_provider === 'stripe' ? 'stripe' : 'nowpayments';
  const stripeAllowed = enabled && data.stripe_enabled === true
    && (environment === 'sandbox' || (merchantCountry !== 'TR' && data.merchant_approved === true));
  const prices = data.stripe_prices && typeof data.stripe_prices === 'object' ? data.stripe_prices as Record<string, unknown> : {};
  return {
    enabled, environment, merchantCountry,
    appleEnabled: enabled && data.apple_enabled === true && Number.isSafeInteger(data.apple_id) && Number(data.apple_id) > 0,
    stripeEnabled: stripeAllowed,
    cryptoEnabled: enabled && data.crypto_enabled === true
      && (cryptoProvider !== 'stripe' || stripeAllowed)
      && (environment === 'sandbox' || (merchantCountry !== 'TR' && data.crypto_approved === true
        && (cryptoProvider !== 'stripe' || merchantCountry === 'US' || data.stripe_crypto_preview_approved === true))),
    appleId: Number(data.apple_id) || 0,
    // External iOS checkout is currently implemented only for the US App Store storefront.
    allowExternalIOS: enabled && data.external_ios_us_enabled === true,
    allowExternalWeb: enabled && data.external_web_enabled === true,
    webAppIDs: Array.isArray(data.web_app_ids) ? data.web_app_ids.filter((id): id is string =>
      typeof id === 'string' && /^1:\d+:web:[a-f0-9]+$/.test(id)).slice(0, 4) : [],
    cryptoProvider,
    cryptoOffers: Array.isArray(data.crypto_offers) ? data.crypto_offers.flatMap(raw => {
      if (!raw || typeof raw !== 'object') return [];
      const offer = raw as Record<string, unknown>;
      if (!SUPPORT_PRODUCT_IDS.some(id => id === offer.product_id) || !['USD', 'GBP', 'EUR', 'TRY'].includes(String(offer.currency))
          || !Number.isSafeInteger(offer.gross_milliunits) || Number(offer.gross_milliunits) < 1000
          || Number(offer.gross_milliunits) > 1_000_000_000 || Number(offer.gross_milliunits) % 10 !== 0) return [];
      return [{ productId: String(offer.product_id), currency: String(offer.currency), grossMilliunits: Number(offer.gross_milliunits) }];
    }).slice(0, 3) : [],
    stripePrices: Object.fromEntries(Object.entries(prices).filter(([id, price]) =>
      SUPPORT_PRODUCT_IDS.some(product => product === id) && typeof price === 'string' && /^price_[a-zA-Z0-9]+$/.test(price))) as Record<string, string>,
  };
}

/** A payload cannot turn an attested native app into the independent web checkout. */
export function supportCheckoutChannelAllowed(settings: SupportSettings, channel: unknown, storefront: unknown, appID: unknown): boolean {
  if (typeof appID !== 'string') return false;
  if (channel === 'web') return settings.allowExternalWeb && settings.webAppIDs.includes(appID);
  return channel === 'ios' && storefront === 'USA' && settings.allowExternalIOS && /^1:\d+:ios:[a-f0-9]+$/.test(appID);
}
export const SUPPORT_PRODUCT_IDS = [
  'com.khankartal.lociar.support.small',
  'com.khankartal.lociar.support.medium',
  'com.khankartal.lociar.support.large',
] as const;

/** Apple reports prices in milliunits. Never calculate money with floating-point percentages. */
export function supportSplit(grossMilliunits: number) {
  if (!Number.isSafeInteger(grossMilliunits) || grossMilliunits <= 0 || grossMilliunits > 1_000_000_000) {
    throw new Error('Invalid support amount');
  }
  const writerMilliunits = Number(BigInt(grossMilliunits) * BigInt(WRITER_SHARE_BPS) / 10_000n);
  return { grossMilliunits, writerMilliunits, remainderMilliunits: grossMilliunits - writerMilliunits,
    writerShareBps: WRITER_SHARE_BPS };
}

export function supportProduct(value: unknown): string {
  if (typeof value !== 'string' || !SUPPORT_PRODUCT_IDS.some(id => id === value)) throw new Error('Invalid support product');
  return value;
}

/** Checkout amounts below are minor units for these explicitly supported two-decimal currencies. */
export function stripeSupportAmount(amount: unknown, currency: unknown): number {
  if (typeof currency !== 'string' || !['try', 'usd', 'eur', 'gbp'].includes(currency)
      || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid Stripe price');
  const milliunits = amount * 10;
  supportSplit(milliunits);
  return milliunits;
}

/** Preserve the fixed writer entitlement during partial refunds; no repeated-rounding drift. */
export function refundableWriterAmount(grossMilliunits: number, refundedMilliunits: number): number {
  if (!Number.isSafeInteger(refundedMilliunits) || refundedMilliunits < 0 || refundedMilliunits > grossMilliunits) {
    throw new Error('Invalid refund');
  }
  return supportSplit(grossMilliunits).writerMilliunits
    - (refundedMilliunits === grossMilliunits ? 0 : supportSplit(grossMilliunits - refundedMilliunits).writerMilliunits);
}
