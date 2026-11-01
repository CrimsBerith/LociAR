# LociAR — App Store launch (verified sources)

**This checklist contains no review credentials or assumed working demo links.** The canonical release materials below take precedence over generated marketing drafts.

- 12-language app listing: `scripts/store-metadata/metadata.json` and generated `docs/release/store-metadata/*.md`.
- Review procedure and actual access instructions: `docs/release/APP_REVIEW_NOTES.md`.
- Release gates and backend parity: `docs/release/APP_STORE_GO_LIVE_2026-10-26.md`, `docs/release/APP_STORE_PREPARATION_2026-10-27.md`, `docs/QA_MATRIX.md`.
- Privacy, legal, age rating and app capability details must reflect the actual Release build.

## Review-account handling

Provision the dedicated account using `functions/scripts/provision-review-account.mjs` with `REVIEW_CREDENTIALS_FILE` set to an absolute path **outside** the Git checkout. Transfer the randomly generated private credentials only to App Store Connect's private *Sign-In Information* fields; never include a password in source, Markdown, tickets, CI output or a screenshot. Validate the account on the Release build before submitting. Do not publish an unverified demo/video URL.

## Product accuracy

AR positioning, persistent anchors and location alerts depend on permissions, compatible devices, available map/anchor data, connectivity and real-world GPS conditions. No millimeter precision, perpetual anchor availability or instant background alert is guaranteed. Features hidden from Release builds, including unapproved payments, are not advertised. Posting anonymously conceals the public author identity; it is not complete network anonymity.

## Submission gates

1. `python3 scripts/l10n/build_catalog.py --check`
2. `python3 scripts/store-metadata/build.py --check` and `python3 aso_check.py`
3. `bash scripts/qa-secret-scan.sh`
4. All GitHub CI jobs passing on the **same commit**, including Swift/Xcode, emulator integration and Chromium.
5. Live Firebase Functions/rules/index/TTL parity, physical GPS/AR/APNs/App Check, TestFlight, legal/privacy and review-account acceptance.

This guide does not authorize a deployment or App Store submission.
