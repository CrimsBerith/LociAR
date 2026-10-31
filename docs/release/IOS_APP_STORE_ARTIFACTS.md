# iOS Release Artifacts - No Submission

## Fill before build
- Firebase iOS app identifiers in Config/Local.xcconfig (see docs/FIREBASE_SETUP.md).
- Apple Sign In provider (Services ID, Team ID, key ID, .p8) in Firebase Authentication.
- APNs Authentication Key (.p8) uploaded in Firebase Console → Cloud Messaging (push).
- Live HTTPS privacy, terms and support pages (TR + `/en`) on Firebase App Hosting; account deletion is in-app.
- Support email and legal entity details (`admin/app/legal-entity.ts`).
- First super_admin via functions/scripts/bootstrap-admin.mjs (also enables TOTP MFA).

## App Privacy disclosure
The App Store Connect answers must match `LociAR/Resources/PrivacyInfo.xcprivacy` exactly; the full table (12 data
types, linked/not linked, purposes, Google ARCore as third party) is in `APP_STORE_SUBMISSION_GUIDE.md` §4.
Tracking: none.

## Review notes
The only current text is [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) §1. Posts publish at once after the automated
checks in `createPost` (owner decision, 18 Oct 2026); moderation is after the fact. Do not paste older summaries that
say posts wait for moderator approval.

## Required test evidence
- Physical iPhone field test (FIELD_APP_CHECKLIST.md, FIELD_TEST_CHECKLIST.md): vertical wall raycast, Cloud Anchor host/resolve, loss/recovery, low light, permissions, offline queue, push, 12 languages.
- Firestore/Storage Security Rules suite (functions: npm run test:rules).
- Admin web panel: magic link, MFA, review, flag, protected-zone and audit checks.
- Legal/support URLs live over HTTPS.
- App Store screenshots, subtitle, review account, and support contact prepared. Submission is done from Xcode/App Store Connect.
