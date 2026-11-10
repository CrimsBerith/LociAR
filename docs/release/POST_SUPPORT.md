# Note-writer support payments

Owner decisions, 20 October 2026:

- The writer receives **72% of the customer's gross support payment**. The remaining 28% covers store/provider fees, taxes and platform costs; it is not a promise of 28% platform profit. The platform bears any shortfall. Amounts use integer currency milliunits, rounded down when splitting; payout rounding must be reconciled per currency.
- The merchant is the owner's **UK Stripe account**, country code `GB` (`UK` is normalized to `GB`). Stripe is the preferred checkout. Apple Pay is an optional wallet inside Stripe Checkout, not StoreKit or an obligatory payment method. Stripe chooses the eligible methods enabled on the merchant account; issuer/provider verification is never bypassed.
- Crypto uses a separate **NOWPayments hosted invoice** by default. It supports the coins/networks enabled on the merchant account. The app holds no wallet/private key. Optional Stripe stablecoin checkout is separately gated because standard UK account eligibility must not be assumed.
- These are voluntary creator support payments, not charitable fundraising. Support never buys note access, rank, location access or an author's identity.

## What is implemented

The note's action row ends with `post-support-button`. It opens amount/method selection. Stripe is selected first wherever external iOS checkout is available; Crypto and optional App Store purchases follow. Native prices come from StoreKit; Stripe prices come from the server's Stripe Price IDs; crypto invoice amounts come from the server's allowlist. The client cannot supply a payable amount, percentage, author or payout destination.

`beginApplePostSupport`, `beginExternalPostSupport` and `beginCryptoPostSupport` create random, private purchase intents. Verified Apple/email accounts only. Location-note support requires a nonexpired server-issued on-site note-reading receipt. Anonymous support checks only anonymous mutes, independently of profile blocks. Processor metadata contains an opaque intent ID, never the anonymous author's identity or note text.

Apple purchases use StoreKit 2, an intent UUID in `appAccountToken`, Apple's server library and the bundled public Apple Root CA G3. App Store signatures, bundle, environment, product, ownership, price and intent are checked before recording. Unfinished purchases are retried after authentication. Refund notifications are signature-verified.

Stripe uses hosted Checkout (including optional Apple Pay and local methods), signature-verified raw-body webhooks, authenticated session/PaymentIntent lookup, paid status, exact currency/amount checks and atomic fulfillment. Async methods wait for actual success. Crypto verifies the sorted SHA512 IPN signature, independently retrieves the payment from the configured environment and checks invoice, amount and currency. Only `finished` with the full quoted crypto amount received credits earnings. `waiting`, `confirming`, `confirmed`, partial, expired and failed payments do not.

The shared Firestore ledger handles concurrent/replayed fulfillment and partial/full refund ordering. Sandbox balances are separate from production. Direct client access to every financial collection is denied by the existing default-deny rules. Account deletion removes app account links from the processor ledger and deletes balance/quota data; opaque processor references remain only for financial reconciliation and replay-safe refunds. Payment-provider financial retention is governed by that provider and must be disclosed before launch.

## Configuration (off by default)

Create `system/post_support` through an authorized server/operator, not the app. Start with sandbox and `enabled: false` until the corresponding provider, business model and webhooks are configured:

```json
{
  "enabled": false,
  "environment": "sandbox",
  "merchant_country": "GB",
  "merchant_approved": false,
  "stripe_enabled": true,
  "external_ios_us_enabled": false,
  "external_web_enabled": false,
  "web_app_ids": [],
  "stripe_prices": {
    "com.khankartal.lociar.support.small": "price_REPLACE_SMALL",
    "com.khankartal.lociar.support.medium": "price_REPLACE_MEDIUM",
    "com.khankartal.lociar.support.large": "price_REPLACE_LARGE"
  },
  "crypto_enabled": false,
  "crypto_provider": "nowpayments",
  "crypto_approved": false,
  "crypto_offers": [
    { "product_id": "com.khankartal.lociar.support.small", "currency": "GBP", "gross_milliunits": 1990 },
    { "product_id": "com.khankartal.lociar.support.medium", "currency": "GBP", "gross_milliunits": 4990 },
    { "product_id": "com.khankartal.lociar.support.large", "currency": "GBP", "gross_milliunits": 9990 }
  ],
  "apple_enabled": false,
  "apple_id": 0
}
```

Replace example prices with real active one-time Stripe prices. Supported Stripe charge currencies: GBP, USD, EUR, TRY (two decimal places). Crypto offers are fiat-denominated quotes; the processor handles the selected coin/network. Verify the provider's minimum amount before enabling a tier. Enable only merchant-approved assets/networks. Percentage is code-owned at 7200 basis points, never editable by a caller or this document.

Secret Manager (never iOS, public Next.js variables or git):

- `SUPPORT_STRIPE_SECRET_KEY`: prefer a restricted UK Stripe key (`rk_test_` / `rk_live_`); standard secret keys are also supported. Environment must match. Grant Checkout Sessions **Write** and Prices, Payment Intents, Charges and Refunds, and Accounts **Read**. No payout, transfer or refund-write permission is needed.
- `SUPPORT_STRIPE_WEBHOOK_SECRET`: secret for `supportStripeWebhook`.
- `SUPPORT_CRYPTO_API_KEY`: NOWPayments sandbox/production API key.
- `SUPPORT_CRYPTO_IPN_SECRET`: NOWPayments IPN secret.

Do not paste real secrets into this example. Deploy the named Firebase Functions in `us-central1` using the repository's normal deployment procedure after validation. The return page is `supportCheckoutReturn` on the same Firebase Functions host.

Stripe events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`. Use snapshot payloads with API version `2026-09-30.endive`, matching Stripe SDK 23. The handler retrieves current provider objects, so duplicate/out-of-order events are safe. Disputed amounts are conservatively reversed in this initial ledger; restoration after a won dispute requires financial reconciliation. No funds can be paid out from this pending ledger.

### Stripe dashboard setup, 20 October 2026

LociAR-created Checkout Sessions explicitly set `branding_settings.display_name: "LociAR"` for the page heading. Stripe still uses the merchant's business identity in legal terms, receipts and other regulated fields; dashboard account naming alone does not change those fields. See [Stripe Checkout appearance](https://docs.stripe.com/payments/checkout/customization/appearance?payment-ui=stripe-hosted).

Three one-time **test-mode** products were created in the existing `anomalybox.com` account: Small GBP 1.99, Medium GBP 4.99 and Large GBP 9.99. Their actual test Price IDs are recorded in [post-support.sandbox.json](post-support.sandbox.json). This file contains no secrets and keeps checkout disabled. The matching `system/post_support` document was created in `lociar-2f38c` with `enabled: false` and `environment: sandbox`; its creation used an `exists: false` precondition to avoid overwriting an existing configuration. Do not reuse these test prices for live payments.

With the owner's explicit confirmation on 21 October 2026, the restricted test key `LociAR Support - Sandbox Backend` and webhook destination `LociAR Support - Sandbox` (`we_1USlcBAnuhYobes5cshRlMaP`) were created. The key and webhook signing secret are version 1 of `SUPPORT_STRIPE_SECRET_KEY` and `SUPPORT_STRIPE_WEBHOOK_SECRET` in Secret Manager project `lociar-2f38c`. Only the four listed test event types are subscribed. No live key or bank payout was created.

On 21 October 2026 the existing Stripe account's dashboard name was changed from `anomalybox.com` to `LociAR`, retaining account ID `acct_1TpVttAnuhYobes5`. No new Stripe account was opened. The restricted key successfully retrieved the account with `country: GB`, `charges_enabled: true`, `details_submitted: true`, and all three active one-time GBP test prices. Cards and Apple Pay are already enabled in the default configuration; the test Checkout showed card, Apple Pay and Revolut Pay choices. This does not verify actual wallet payment authorization or live settlement.

Deploy only the seven Stripe/catalog/receipt functions with `bash scripts/firebase-deploy.command --support-stripe` (append `--dry-run` to build/stage without deploying, or `--only=name,...` for a subset). The wrapper selects working Node 22, including on Macs with a broken or incompatible default Node. The script stages an entry point for each individual function and deploys explicit names sequentially, preserving other existing functions. The static return page lives in `supportReturn.ts` and does not initialize Admin SDK or processor modules. This avoids Firebase CLI's global secret resolution requiring optional NOWPayments credentials before deploying Stripe. No placeholder keys or disabled App Check are used.

The Functions Framework is pinned explicitly to `5.0.5` rather than relying on the buildpack's older injected version. CloudEvents' UUID dependency is constrained to the project's patched CommonJS-compatible `11.1.1` line. A clean isolated production install and CloudEvent creation passed with zero audit findings; the local framework served `supportStripeWebhook` and correctly rejected GET with HTTP 405. The 150 backend tests passed again after this runtime dependency change.

The exact uploaded production archive also passed a Google Cloud Build startup check on Linux, Node `v22.23.2`, UID 33, using the same `google-22-full/runtimes/nodejs22` base image as the managed function. The HTTP probe returned 405 as expected (build `51ca420c-c0b2-47fd-921a-46a90031da49`). This Linux check is separate from Cloud Run readiness and Stripe webhook delivery.

**Deployment is blocked as of 21 October 2026.** Both the Stripe webhook and the return-page deployments built successfully but their managed Cloud Run revisions failed to become ready on port 8080. The latest return revision, `supportcheckoutreturn-00008-f7x`, reports `Ready: False / HealthCheckContainerError`; the public return URL currently responds HTTP 403. The Functions metadata's `ACTIVE` state does not establish a working Cloud Run service. Standard entry-point staging, runtime-update policy and memory checks did not resolve startup, and there are no application startup markers in the revision logs. Billing is enabled and the required Run/Functions service-agent role bindings are present; the root cause remains unresolved. Automatic runtime updates are retained. No existing application functions were redeployed. No sandbox Checkout payment has been submitted and the webhook has zero deliveries. Keep `system/post_support.enabled` false.

Temporary plaintext setup credentials were removed after saving both secrets in Secret Manager. The test webhook remains active in Stripe; this is registration evidence only, not successful delivery evidence.

NOWPayments: register `https://us-central1-lociar-2f38c.cloudfunctions.net/supportCryptoWebhook` as IPN URL/secret. Test against its sandbox endpoint. A payment receipt or screenshot, unconfirmed transaction hash or browser return is never payment proof. Full refund status reverses earnings; partial crypto refunds require provider reconciliation.

Optional StoreKit: create three consumable products using the IDs above, set the real numeric App Store app ID, and register `supportAppleNotifications` as the App Store Server Notifications V2 URL for the configured environment. Xcode-signed local StoreKit transactions are intentionally rejected by the production-verification path; use the App Store sandbox for end-to-end payment testing.

## Storefront and country controls

UK merchant country does not mean every iOS storefront permits external checkout for digital content. The current native integration exposes external checkout only when both `Storefront.current.countryCode == "USA"` and server `external_ios_us_enabled` are true. The server also requires an App Check-verified iOS app ID. Other iOS storefronts use optional StoreKit if configured. Apple Pay inside Stripe does not replace App Store rules. A future independent web checkout additionally requires `external_web_enabled: true` and its exact App Check-verified Firebase web app ID in the server-owned `web_app_ids` allowlist. Changing a native payload to `channel: "web"` cannot satisfy this check. A public website/sign-in flow is not included in this change.

Before production set `environment: "production"`, confirm actual Stripe account country `GB`, business approval and charging readiness, and configure a live webhook. Crypto additionally needs `crypto_approved: true` for the merchant's eligible jurisdiction/use case. Turkey live configuration stays disabled. Stripe crypto on a non-US merchant requires explicit preview approval (`stripe_crypto_preview_approved`); independent NOWPayments is the UK default.

## Remaining release gates

- Stripe test products, restricted credentials and the active test webhook exist. Firebase deployment is blocked by the managed-runtime startup failure above; webhook delivery is unverified. NOWPayments and App Store provider setup remains separate.
- Validate a real sandbox purchase, cancellation, async completion, duplicate webhook, partial/full refund and crypto underpayment before enabling live checkout.
- Buyer-scoped recovery and atomic pending-checkout locks are implemented locally on 21 October 2026. Deploy the matching create/receipt/refresh/ledger/account-deletion changes together before enabling payments. Known Stripe sessions are reconciled with Stripe; only confirmed unpaid expiry releases the lock. Unknown Stripe creation outside its safe retry window and an uncertain NOWPayments invoice POST stay blocked for manual reconciliation. Never expire these solely from a local timer or assume a browser cancellation proves a failed payment.
- Completed external support references now remain recoverable through the same private document. A delayed request retry reuses that checkout even after fulfillment. Starting another donation requires the explicit native repeat action and its `previousIntentId`, matching the last settled reference. A retry with the previous donation's reference cannot silently create a third donation after the second has already completed. The matching native/backend versions must ship together.
- **Withdrawal is not enabled.** Earnings remain `pending`. Actual creator onboarding, payout destination verification, received-funds/tax reconciliation, minimum withdrawal amounts and payouts require a separately configured payout provider. There is no fake balance withdrawal or unchecked client bank transfer.
- Confirm fees/taxes fit inside the remaining 28%, or fund the difference. The writer's agreed 72% is not reduced by unexpected processor costs.
- Update public terms/privacy and App Review notes for the finalized provider/payout design before activating this feature.

## Validation

`npm test` includes gross splitting, rounding/refunds, UK defaults and crypto signature/confirmation tests. `npm run test:support` runs the Firestore-emulator ledger/authorization/race/refund/privacy checks. Use Node 22 and Java 21, then run existing rule tests, localization checks and the iOS build.

Local results, 20 October 2026: 150 backend tests (including restricted-key environment validation), 8 payment-ledger emulator tests and 88 security-rule tests passed. The arm64 iPhone 16 Pro simulator build and two targeted UI tests passed, including rightmost support action navigation and hiding self-support. All 12 language catalogs and compiler-extracted strings passed. Production dependency audit reported zero vulnerabilities. These results do not verify live Stripe/NOWPayments/App Store settlement or any bank payout.

On 21 October 2026, the current local worktree built again for the arm64 iPhone 16 Pro, iOS 26.5 simulator. Four targeted UI tests passed: own-post support hidden; rightmost 44-point support action, 72% explanation, unavailable-state retry/dismiss; private earnings failure without an invented balance; and large-text navigation. Screenshot review caught an invalid legacy Dynamic Type launch value. Both affected tests now use `UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue`; the support large-text test was rerun separately with the corrected value. Seven payment-policy tests and eight clean Firestore-emulator ledger tests passed again. Evidence and limitations: [POST_SUPPORT_TEST_2026-10-21.md](POST_SUPPORT_TEST_2026-10-21.md). No physical device, actual wallet authorization, provider settlement or writer payout was tested.

Primary references: [Apple review payment rules](https://developer.apple.com/app-store/review/guidelines/), [Apple server library](https://github.com/apple/app-store-server-library-node), [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe stablecoin eligibility](https://docs.stripe.com/payments/stablecoin-payments), [NOWPayments invoice API](https://github.com/NowPaymentsIO/nowpayments-api-js/blob/master/src/actions/create-invoice/index.ts), [NOWPayments IPN verification](https://nowpayments.io/blog/nowpayments-api-explained-customize-your-payment-gateway).

Follow-up hardening and current deployment evidence: [POST_SUPPORT_HARDENING_2026-10-21.md](POST_SUPPORT_HARDENING_2026-10-21.md). This supersedes the earlier view-local recovery limitation; the managed-runtime deployment blocker remains.

Further native/simulator checks and completed-payment recovery: [POST_SUPPORT_NATIVE_FOLLOWUP_2026-10-21.md](POST_SUPPORT_NATIVE_FOLLOWUP_2026-10-21.md).
