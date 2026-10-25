# Writer-support native follow-up, 21 October 2026

Local uncommitted changes on `codex/fix-anonymous-location-audit`. Existing unrelated work was retained. This supplements [the earlier hardening report](POST_SUPPORT_HARDENING_2026-10-21.md).

## Changes

- Fixed completed-payment recovery: fulfillment retains the private buyer/note/environment reference. Reopening after the payment completed while the app was closed now restores the receipt, including a later refund, rather than immediately offering another payment.
- A new donation requires a separate native action and the matching `previousIntentId`. Concurrent requests and a delayed retry after the next donation has already completed still reuse one intent. Confirmed unpaid expiry remains the only automatic release of an uncertain external checkout. The matching backend and native versions must deploy together.
- Native catalog validation now rejects negative/zero/oversized amounts, malformed currencies, unknown products and duplicate offer identifiers before displaying payment options. The writer allocation remains 72% of gross.

## Verification

Evidence is under `build/support-followup-20261021/`.

| Check | Result | Evidence |
| --- | --- | --- |
| iPhone 16 Pro, iOS 26.5, arm64 | 18 passed, zero failures/skips: 3 native unit tests + 15 fixture UI tests | `final-native.xcresult`, `native-summary.json` |
| iPhone SE third generation, iOS 26.5 | 5 passed, zero failures/skips; small-screen subset, with the repeat-purchase fixture additionally checking the previous intent supplied by the native client | `small-screen.xcresult`, `small-summary.json` |
| Backend TypeScript build + policy/unit tests | 154 passed | `backend.log` |
| Isolated Firestore ledger/recovery/race tests | 17 passed | `ledger-verified.log` |
| Release arm64 simulator build | Passed; support fixture/scenario markers absent from the Release executable | `release.log`, `verification.json` |
| 12-language catalogs/release localization | Passed | `catalog-final.log`, `localization-final.log` |

Native cases cover the rightmost action, own-post exclusion, unavailable/error handling, true Accessibility XXXL, Arabic/RTL, unavailable earnings, pending and completed recovery across relaunch, provider-confirmed expiry, storefront restrictions, Stripe and crypto request timeouts, failed recovery, receipt verification, refunds, status failures and explicit repeated support. The small-screen subset covers crypto timeout recovery, Arabic, refunds, completed-payment recovery/repeat and Accessibility XXXL. Actual simulator screenshots were exported and visually checked in `pro-screenshots/` and `se-screenshots/`.

The UI cases use Debug-only fixtures. They create no provider payment or invoice. The emulator tests use a separate port and demo project; the existing emulator was left running. The initial default-port attempt could not start; the successful isolated run is the verification result. The earlier 88 security-rule tests remain separate evidence; rules were unchanged in this follow-up.

## Remaining release gates

The live service was read again, without deployment: `supportcheckoutreturn-00008-f7x` is still `Ready: False / HealthCheckContainerError`. The live payment configuration is still disabled/sandbox, with external iOS, crypto and Apple switches false; the unset web switch defaults to false. Snapshots: `cloud-readiness.json`, `payment-switches.json`.

No real Stripe/crypto charge, wallet authorization, refund webhook delivery, writer bank payout, physical-iPhone acceptance, current GitHub CI or App Store/TestFlight release is proven by these local tests. The registered physical iPhone was unavailable. NOWPayments merchant setup and optional StoreKit product setup remain incomplete. No cloud rebuild, live activation, commit/push or release submission was performed in this follow-up. The managed-runtime blocker and provider acceptance gates must be resolved before enabling payments.
