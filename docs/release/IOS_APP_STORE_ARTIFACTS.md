# iOS Release Artifacts - No Submission

## Fill before build
- Firebase iOS app identifiers in Config/Local.xcconfig (see docs/FIREBASE_SETUP.md).
- Apple Sign In provider (Services ID, Team ID, key ID, .p8) in Firebase Authentication.
- Redirect allowlist: lociar://auth/callback, private admin scheme, and final HTTPS admin callback.
- Real HTTPS privacy, terms, support, and account deletion URLs.
- Support email and legal entity details.
- Sentry DSN and release environment.
- First super_admin via functions/scripts/bootstrap-admin.mjs (also enables TOTP MFA).
- Expo project ID for the separate private admin app.

## App Privacy disclosure matrix
| Category | Collected | Linked to identity | Purpose |
| --- | --- | --- | --- |
| Precise location | Yes while in use | Yes for creators | AR discovery, surface placement, safety |
| Camera and photos | Yes after permission | Yes for uploaded post | User-generated AR content |
| Contact/account identity | Yes | Yes | Authentication, account management |
| User content and reports | Yes | Yes | Community and moderation |
| Diagnostics | Yes if Sentry enabled | No | App functionality and crash repair |
| Usage analytics | Yes | Pseudonymous | Product improvement and abuse prevention |
| AR environment scan | On-device native session | No by default | Plane detection and alignment |

## Review notes
LociAR is a UGC AR surface-discovery app. Sign-in (Sign in with Apple or verified email) is required to view and create; a pre-verified demo account with sample posts is provided. Every public post is pending_review until an owner approves it. The app exposes report, block, support, and account deletion paths. Protected zones are server-side hard-blocked and 18+ content is rejected. The native AR feature is a camera plus ARKit plane/raycast experience; platform videos are not extracted or rehosted.

## Required test evidence
- iPhone native development IPA field test: vertical wall raycast, loss/recovery, own-video plane, low light, permissions, offline queue.
- Firestore/Storage Security Rules suite (functions: npm run test:rules).
- Owner Admin IPA magic link, MFA, review, flag, campaign, protected-zone, audit export, and push test.
- Legal/support URLs live over HTTPS.
- App Store screenshots, subtitle, review account, and support contact prepared. Do not run eas submit in this repository workflow.
