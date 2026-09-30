# iOS Release Artifacts - No Submission

## Fill before build
- Firebase iOS app identifiers in Config/Local.xcconfig (see docs/FIREBASE_SETUP.md).
- Apple Sign In provider (Services ID, Team ID, key ID, .p8) in Firebase Authentication.
- Redirect allowlist: lociar://auth/callback, private admin scheme, and final HTTPS admin callback.
- Real HTTPS privacy, terms, support, and account deletion URLs.
- Support email and legal entity details.
- First super_admin via functions/scripts/bootstrap-admin.mjs (also enables TOTP MFA).

## App Privacy disclosure matrix
| Category | Collected | Linked to identity | Purpose |
| --- | --- | --- | --- |
| Precise location | Yes while in use | Yes for creators | AR discovery, surface placement, safety |
| Camera | Yes after permission | Only the AR feature map when pinning; no camera image is stored (no photo/video posts) | AR placement |
| Contact/account identity | Yes | Yes | Authentication, account management |
| User content and reports | Yes | Yes | Community and moderation |
| Usage analytics | Yes | Pseudonymous | Product improvement and abuse prevention |
| AR environment scan | Camera feature data sent to Google ARCore (Cloud Anchors) | Yes, to Google | Re-finding a pin in the same place; disclosed in the in-app notice |

## Review notes
LociAR is a UGC AR surface-discovery app. Sign-in (Sign in with Apple or verified email) is required to view and create; a pre-verified demo account with sample posts is provided. Every public post is pending_review until an owner approves it. The app exposes report, block, support, and account deletion paths. Protected zones are server-side hard-blocked and 18+ content is rejected. The native AR feature is a camera plus ARKit plane/raycast experience; platform videos are not extracted or rehosted.

## Required test evidence
- iPhone native development IPA field test: vertical wall raycast, loss/recovery, low light, permissions, offline queue.
- Firestore/Storage Security Rules suite (functions: npm run test:rules).
- Admin web panel: magic link, MFA, review, flag, protected-zone and audit checks.
- Legal/support URLs live over HTTPS.
- App Store screenshots, subtitle, review account, and support contact prepared. Submission is done from Xcode/App Store Connect.
