# Legal & Support (App Store prerequisites)

The pages are live on Firebase App Hosting (backend `lociar-admin`) and served by the admin app
(`admin/app/{privacy,terms,support}` and their `/en` versions). Content facts (controller, contact, retention)
live in `admin/app/legal-entity.ts`.

## Live URLs

| Item | Turkish | English |
|------|---------|---------|
| Privacy Policy (KVKK + GDPR) | `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy` | `…/privacy/en` |
| Terms of Use + community rules (incl. Apple EULA, zero tolerance) | `…/terms` | `…/terms/en` |
| Support | `…/support` | `…/support/en` |

Values live in `Config/Base.xcconfig` (`LOCIAR_PRIVACY_URL`, `LOCIAR_TERMS_URL`, `LOCIAR_SUPPORT_URL`). If a custom
domain is attached, update `Config/Base.xcconfig`, `admin/apphosting.yaml` (`ADMIN_ORIGIN`) and App Store Connect together.

## What the privacy policy covers (keep in sync with `LociAR/Resources/PrivacyInfo.xcprivacy`)

- Location while in use (nearby posts, the post's location; temporary precise location for AR positioning).
- Camera for AR placement only; no camera images are stored. Visual feature data goes to Google ARCore.
- Account data: email, Apple sign-in name, username, optional profile photo (screened by Google Cloud Vision).
- User content: text posts, comments, likes, saves, collections, follows, blocks, reports.
- Push notification token (Firebase Cloud Messaging via APNs) when notifications are allowed.
- Crash reports and diagnostics (Firebase Crashlytics, 90 days; can be turned off in Profile → Settings).
- Account deletion: full hard delete from Profile → Delete account permanently.
- Third parties: Google Firebase (Auth, Firestore, Storage, Cloud Functions, App Check, Cloud Messaging,
  Crashlytics), Google Cloud Vision, Google ARCore. Data is stored in the United States.
- No phone number or SMS sign-in is collected; no tracking, no advertising.

## App Review contact

- Email: same as support (`support@alfagolab.com`, the owner's Alfago Lab domain with Hostinger mail; owner decision
  26 Oct 2026). `lociar.app` is not registered, so no `@lociar.app` address is used.
- Demo path: verified `apple-review@alfagolab.com` account + `seed-review-content.mjs` sample posts (password only in
  App Store Connect).

## UGC statement (for App Review notes)

> Users accept the privacy policy and community rules with an explicit checkbox before signing in. New posts go live
> after the automatic text filter, link ban, protected-zone and 18+ checks (owner decision, 18 Oct 2026); content
> reported by several verified users is hidden automatically. Posts, comments and users can be reported and users
> blocked from inside the app; reports are reviewed within 24 hours. 18+ content is not allowed and protected
> locations are hard-blocked on the server. The full current notes text is `docs/release/APP_REVIEW_NOTES.md` §1.
