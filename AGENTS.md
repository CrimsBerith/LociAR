# LociAR Agent Instructions

LociAR mobile is the **native iOS app** (SwiftUI + ARKit + RealityKit). No Expo, Metro, or React Native.

Open `LociAR.xcodeproj` at the repo root. After `project.yml` edits: `xcodegen generate`.

## Backend: Firebase (since 27 Sep 2026) — Supabase is retired

- Project `lociar-2f38c`, Firestore `nam5`, Cloud Functions **`us-central1`** (must match Firestore; do not change).
- Setup/deploy guide: `docs/FIREBASE_SETUP.md`. Deploy from a Mac with internet: `scripts/firebase-deploy.command`.
- The Supabase version is archived in `../_backups/` — do not re-introduce Supabase code, env keys or docs.

## Security contract (non-negotiable — do NOT add "Spark/free-tier fallbacks")

- **Server-authoritative writes.** Posts, profile creation, counters (`likes_count`, `views_count`, `saves_count`,
  `comments_count`, `follower_count`, `following_count`, `public_post_count`), activity events, account deletion
  and moderation are written **only** by Cloud Functions / Admin SDK. The iOS client never writes `posts` or
  counter fields and never falls back to direct Firestore writes when a callable fails — surface the error instead.
- Usernames are unique: they change only through the `updateHandle` callable (`handles/{handle}` reservations).
  Profile photos are uploaded to `avatars/{luid}/pending/` and published only by `screenAvatar` after
  Cloud Vision SafeSearch; clients may set `avatar_preset` (fixed list) or clear `avatar_url`, nothing else.
- Identity is the `luid` custom claim (UUIDv5 of the Firebase UID) set by the `ensureProfile` callable.
  Rules and Storage paths key on `request.auth.token.luid`.
- New posts default to `pending_review`; protected zones, 18+ checks, rate/density limits run in `createPost`.
- `deleteAccount` is a full hard delete (Firestore, Storage, Auth user). Apple sign-in token revocation failure
  aborts deletion (App Store guideline 5.1.1(v)).
- `firestore.rules` / `storage.rules` are default-deny; changes must keep `functions/test/rules/*` passing.
- Blaze plan is required (Storage + Functions). Never weaken rules to work around Spark limits.
- Service-account keys and Admin SDK credentials never ship in the iOS app or in `NEXT_PUBLIC_*`.
- Posts are a **message: text and/or one GIPHY GIF** (owner decision, 9 Oct 2026), shown as a chat-style bubble in AR. Device photo/video uploads were removed on 29 Sep 2026; social media links (Spotify, YouTube, TikTok, Instagram, X, Facebook) and new drawings on 9 Oct 2026: `createPost` accepts only `text` and `gif` layers and rejects image layers, drawings, own video and any URL (`functions/src/placement.ts`); the admin content editor creates text posts only (`admin/lib/content-ops.ts`); Storage denies uploads to `post-layer-assets` and `post-video-assets`. Old posts may still carry a drawing (still rendered) or a link in `content_source_json`; clients must decode it without crashing and never show the link. Do not re-add media or links without a product decision.
- **GIFs come from GIPHY** (Tenor's public API shut down on 30 Jun 2026). The key is the `GIPHY_API_KEY` secret, used only by the `searchGifs` callable and `createPost` (`functions/src/giphy.ts`); never ship it in the app. A GIF layer stores only the GIPHY id (`gifId`, letters and digits); `createPost` re-reads it from GIPHY (rating at most `pg-13`) and writes the size GIPHY reports. The app builds media URLs from the id on `media.giphy.com` only and shows "Powered by GIPHY" wherever search results appear.

## Product decisions

- SMS auth is disabled unless the owner re-enables it.
- **iOS only.** Do not add Android, Expo, Metro, or React Native.
- Mobile users cannot publish in protected zones; authorized admins may use a separately permissioned, reasoned zone exception (owner decision, 5 Oct 2026). 18+ content remains hard-blocked for everyone.
- Admin delegated posts/comments identify the selected user publicly and record the acting admin separately in audit. New managed content identities have disabled, unverified Auth logins and no admin role. See `docs/release/ADMIN_CONTENT_OPERATIONS.md`.
- Pin uses the center reticle against detected plane geometry. Approximate placement is explicit.
- AR re-localization uses **Google ARCore on top of the ARKit session** (SPM `arcore-ios-sdk`): Cloud Anchors
  (365-day TTL) first, then Geospatial (VPS), then the legacy ARKit world map, then aim-guided reveal.
  Authorization is keyless via the `getArcoreToken` callable; never ship an ARCore API key. Anchors are deleted
  with the post/account (`functions/src/arcoreManagement.ts`). The Google sensor-data notice
  (`ARCoreDisclosure.swift`) must stay on every AR screen. No Android.
- Admin (`admin/`) is Next.js on the Firebase Admin SDK (session cookie + TOTP MFA + static RBAC), deployed on
  **Firebase App Hosting** (`admin/apphosting.yaml`, backend `lociar-admin`). It also serves the public
  `/privacy`, `/terms`, `/support` pages the iOS app links to. Everything runs on Firebase: no Docker, no Vercel,
  no Supabase. On App Hosting the Admin SDK uses the backend's service account; no key file.
- **Push notifications:** Enabled via APNs & FirebaseMessaging (`NotificationService.swift`, `LociAR.entitlements` `aps-environment`).
  Tokens go through the `registerPushToken` / `unregisterPushToken` callables (server-only `push_tokens`, keyed by
  installation id); `onActivityCreated` (`functions/src/push.ts`) sends texts localized on the server (`pushPolicy.ts`).
- **Localization:** 12 languages (`tr`, `en`, `zh-Hans`, `hi`, `es`, `fr`, `ar`, `bn`, `pt`, `ru`, `de`, `ja`) via
  `Localizable.xcstrings` + `InfoPlist.xcstrings`. Development region is `en` (fallback for other languages); catalog keys
  are the Turkish source literals. Never edit the catalogs by hand: add translations to `scripts/l10n/translations/*.json`
  and run `python3 scripts/l10n/build_catalog.py` (CI runs `--check` and verifies the compiler-extracted keys).
  Messages use `String(localized:)`; text kept in `String` properties is shown with `.localizedUI`.
  `node scripts/check-localization.mjs --release` must pass too (no raw Turkish UI strings).
- **Crash reporting:** Firebase Crashlytics enabled.
- **Store availability:** Global (all territories).
- **Media model:** Text and/or one GIPHY GIF (no photos, videos, drawings or links). Social media links and drawings removed 9 Oct 2026.

