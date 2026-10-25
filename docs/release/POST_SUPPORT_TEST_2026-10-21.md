# Writer support: Xcode verification, 21 October 2026

Local checkout: `codex/fix-anonymous-location-audit`, uncommitted support implementation. Existing unrelated changes were retained. This run did not push a commit, deploy an iOS release, or verify GitHub CI.

## Native simulator

Xcode project: `LociAR.xcodeproj`, scheme `LociAR`, Debug, arm64. Destination: iPhone 16 Pro / iOS 26.5, `75C35C99-A013-4C65-B3FC-EA47FAEE6578`.

- Own-post support button stays hidden.
- The support action appears to the right of Like and Save with a minimum 44-point touch target, and opens the actual support sheet.
- The sheet displays the 72% writer allocation and the identity/payment-account privacy explanation.
- With its provider unavailable, the screen shows an explicit error and no Pay button. Retry and Close work.
- Earnings show a service error instead of an invented zero balance or withdrawal control.
- The corrected Accessibility XXXL test can reach Retry and Close and return to the note. The former hardcoded category value did not apply the requested font size and was replaced with UIKit's actual raw value.

These are **Debug fixture UI tests**: they use local sample posts/accounts and an unconfigured payment client. They do not contact Stripe or verify a charged payment. Four targeted UI tests passed; the corrected large-text test was rerun separately. No physical iPhone was used.

Evidence (repository-relative, ignored build artifacts):

- `build/post-support-20261021/support-ui.xcresult`
- `build/post-support-20261021/support-ui-tests.log`
- `build/post-support-20261021/ui-summary.json`
- `build/post-support-20261021/screenshots/manifest.json`
- `build/post-support-20261021/support-large-text.xcresult`
- `build/post-support-20261021/support-large-text-tests.log`

## Payment policy and Firestore emulator

Seven policy tests and eight ledger tests passed on Node 22 / Java 21. They cover gross 72% splitting, rounding and refund conservation, environment/key separation, UK configuration, crypto signatures/underpayment, concurrent and replayed fulfillment, wrong amounts, out-of-order refunds, independent anonymous blocks, on-site location-note grants, and account-deletion cleanup.

- `build/post-support-20261021/support-policy-tests.log`
- `build/post-support-20261021/ledger-tests.log`

These local policy/emulator checks do not prove provider settlement.

## Provider and deployment status

The UK Stripe account is labeled LociAR. Three GBP test prices, the restricted test key and the active four-event test webhook exist; both secret values are in Google Secret Manager. A setup-only Checkout session showed card, Apple Pay and Revolut Pay, but **no payment was submitted** and the destination has **zero deliveries**.

The new Firebase/Cloud Run revisions build successfully and fail runtime readiness on port 8080. Latest checked return revision: `supportcheckoutreturn-00004-sow`, `Ready: False`, `HealthCheckContainerError`; return-page HTTP probe: 403. Its Functions metadata still says ACTIVE, which is not proof of readiness. Standard service-agent role bindings are present; no missing-role repair was justified. Automatic runtime updates remain enabled. The root cause is not established.

`system/post_support` remains disabled in sandbox. NOWPayments merchant credentials, App Store products, bank payout onboarding, and actual provider payment/refund delivery remain unverified/unconfigured.

## Additional code-review finding

Superseded locally by [the follow-up hardening](POST_SUPPORT_HARDENING_2026-10-21.md): server-owned recovery and concurrency protection are now implemented and tested. They have not been verified on the blocked deployed payment backend. The paragraph below records the original finding.

`PostSupportView.pendingIntent` is view-local `@State`. Dismissing the sheet or terminating the app loses the pending external-checkout reference. The receipt endpoint also lacks terminal expiry/cancellation reconciliation. This must be resolved before enabling external payments to prevent an uncertain payment from prompting a fresh checkout. This is a code-inspection finding; the blocked provider path prevented runtime reproduction.
