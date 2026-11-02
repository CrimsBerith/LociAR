# Writer-support hardening, 21 October 2026

Scope: the existing native iOS writer-support flow, Firebase deployment startup and cost controls. Changes are in the dirty local checkout, branch `codex/fix-anonymous-location-audit`. Existing unrelated edits were retained. No commit was pushed and no App Store/TestFlight release was made.

## Fixed in local code

- A private server-owned lock permits only one unsettled external checkout per buyer, note and environment. Concurrent calls and retries reuse it; another method or amount cannot silently create a second purchase.
- The native sheet restores that reference from the authenticated server after dismissal, process termination or a lost Checkout response. Recovery works without a price catalog. No local note text, author identity or payment credentials are persisted for recovery.
- Stripe retries use the original quote, fixed expiry and idempotency key. Recent uncertain creations can recover through the same key. Known sessions reconcile paid status, refunds and genuine unpaid expiry with Stripe; a browser redirect or local clock never grants success or releases an uncertain payment. Stripe's [expired session behavior](https://docs.stripe.com/api/checkout/sessions/object) is the provider authority.
- NOWPayments invoice creation is claimed atomically before its POST. A timeout cannot issue another invoice automatically: the API's [hosted invoice flow](https://github.com/NowPaymentsIO/nowpayments-sdk-nodejs#quick-start-hosted-checkout) does not provide the same creation idempotency guarantee. Uncertain creation requires reconciliation; crypto remains disabled.
- A native payload cannot bypass storefront controls by changing its channel to web. The channel is bound to the verified App Check app ID; web additionally needs an explicit server switch and exact web-app allowlist.
- Stripe signature verification runs before Firestore reads or API-key lookup. Repeated invalid requests cannot consume those downstream operations. Provider refreshes have an authenticated 10-per-minute quota.
- Sandbox receipts explicitly carry their environment and the UI labels test payments. Unknown status, wrong 72% share, cross-intent receipts, untrusted checkout URLs and unsafe balance totals fail closed. Test fixtures cannot create payments and are excluded from Release builds.
- Asynchronous results from a previous account/screen generation are discarded. Earnings are cleared on refresh/account change so a failed request cannot display another account's or stale balance.
- Crypto decimal parsing removes insignificant trailing zeroes without rounding underpayments up. Deep/malformed callback structures are rejected. Partial refunds no longer infer a full refund merely from a rounded-down writer balance.
- Account deletion includes the new buyer-owned lock and refresh-quota documents. All financial collections remain closed to direct client reads/writes.

## Optimizations

- Catalog-only Stripe prices share an in-flight request and a 30-second bounded cache. Actual checkout prices are retrieved afresh. Pending recovery skips catalog requests. A resumed link still requires the server switch and a freshly checked permitted storefront; status reads remain available when a method is disabled.
- Stripe network retries/timeouts are bounded; native checkout/status calls use a matching 60-second envelope.
- Each scoped deployment initializes only its selected function. The static return page imports neither Admin SDK nor Stripe and serves HTTP 200 locally with restrictive response headers.
- `bash scripts/firebase-deploy.command --support-stripe --dry-run` selects working Node 22. The Mac's default Node 26 currently fails to load `libsimdjson.33.dylib`; no global toolchain or other app was changed.
- Existing live cost controls were retained: zero minimum instances in the inspected inventory, maximum two for this return service, one-day Functions artifact cleanup and existing App Hosting image cleanup. These settings are not proof of a zero bill. Exact service charges still require the billing report login.

## Verification

All final checks below passed:

| Layer | Result | Evidence under `build/support-hardening-20261021/` |
| --- | --- | --- |
| Backend build/unit policy | 154 passed | `backend-final-tests.log` |
| Clean Firestore ledger/recovery/race tests | 15 passed | `ledger-final-tests.log` |
| Firestore/Storage security rules | 88 passed | `rules-tests.log` |
| Xcode native unit + fixture UI tests | 9 passed across two bundles, zero failures | `native-verified.xcresult`, `storefront-verified.xcresult` |
| Release simulator build, arm64 iPhone 16 Pro | Passed | `release-build.log` |
| 12-language catalog and release checks | Passed | `localization-check.log`, `localization-release.log` |
| Scoped deployment staging, automatic Node 22 selection | Passed without deployment | `wrapper-dry-run.log` |

The seven UI scenarios cover the rightmost action, own-post exclusion, unavailable-state retry/dismiss, true Accessibility XXXL, earnings failure without a fabricated balance, pending recovery across relaunch with no catalog, provider-confirmed expiry, and preventing a pending checkout from reopening in an unsupported storefront (the action/unavailable checks share one scenario). The two native unit tests cover URL boundaries and receipt validation. These UI tests use explicitly identified Debug fixtures; they do not prove a provider payment. The Release build compiles without the fixture client. No physical iPhone, actual wallet authorization, bank payout, CI or store distribution was verified.

## Managed-runtime blocker remains

One new source build deployed only the isolated return function; it still failed readiness (`supportcheckoutreturn-00005-muh`). Two subsequent startup checks reused that built image without another build: a dependency-free Node HTTP entry point (`00006-5rw`) and the normal entry point in the second-generation Cloud Run execution environment at 512 MiB (`00007-krm`). Both failed the port-8080 health check. First/second-generation environment differences are documented by [Google](https://docs.cloud.google.com/run/docs/configuring/execution-environments); the failed comparison does not establish a root cause.

Diagnostic settings were reverted. The final revision `supportcheckoutreturn-00008-f7x` has the original image entry point, no custom command/arguments, 256 MiB, 1 CPU, default execution environment and maximum two instances. It remains `Ready: False / HealthCheckContainerError`. No other existing application functions were deployed. The application-start markers do not appear in the failed revision logs; the earlier Linux source/runtime smoke checks succeeded. Billing is active and the expected service-agent role bindings exist. This evidence isolates the problem further but does not prove a Google platform defect or identify an actionable missing permission.

Further blind rebuilds were stopped. [Google support evidence](SUPPORT_RUNTIME_CASE_2026-10-21.md) is prepared for review; it has not been sent to anyone. The configured Stripe webhook has not been demonstrated to deliver HTTP 200. All new application/payment hardening above is local until the managed runtime can deploy successfully.

The live configuration was read again: `enabled: false`, `environment: sandbox`, external iOS/crypto/Apple switches false. No live checkout or bank payout was enabled and no payment was submitted. NOWPayments merchant setup, StoreKit products, real provider payment/refund delivery and writer payout onboarding remain release gates.
