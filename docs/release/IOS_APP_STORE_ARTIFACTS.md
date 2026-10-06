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
LociAR is a UGC AR surface-discovery app. Sign-in (Sign in with Apple or verified email) is required to view and create; a pre-verified demo account with sample posts is provided. Every public post is pending_review until an owner approves it. The app exposes report, block, support, and account deletion paths. Protected zones are server-side hard-blocked and 18+ content is rejected. The AR feature uses ARKit plane/raycast placement plus Google ARCore Cloud Anchors and Geospatial for re-finding posts (Google's sensor-data notice is shown before ARCore runs); platform videos are not extracted or rehosted. Users accept the terms with an explicit checkbox; likes, comments and follows can send push notifications.

## Required test evidence
- Physical iPhone field test (FIELD_APP_CHECKLIST.md, FIELD_TEST_CHECKLIST.md): vertical wall raycast, Cloud Anchor host/resolve, loss/recovery, low light, permissions, offline queue, push, 12 languages.
- Firestore/Storage Security Rules suite (functions: npm run test:rules).
- Admin web panel: magic link, MFA, review, flag, protected-zone and audit checks.
- Legal/support URLs live over HTTPS.
- App Store screenshots, subtitle, review account, and support contact prepared. Submission is done from Xcode/App Store Connect.
