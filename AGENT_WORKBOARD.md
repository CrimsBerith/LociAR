> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# LociAR Agent Workboard

This is the live coordination board for multi-agent work. Update it before claiming files and after handing off.

Protocol: `MULTI_AGENT_PROTOCOL.md` **v1.2**. Scope: `docs/APP_STORE_1_0_SCOPE.md` (2026-08-06 freeze).

## Pre-Deploy Campaign (P0–P13)

Master plan: session pre-deploy plan. Evidence root: `artifacts/pre-deploy/`.

| Phase | TaskID | Owner | Status | Evidence | Blocker |
| --- | --- | --- | --- | --- | --- |
| P0 | P0-01 Scope freeze | Lead | DONE | Policy A **owner-confirmed** (SMS off); `ONLINE_GO_LIVE.md` | — |
| P0 | P0-02 Git package plan | Repo Hygiene | PENDING | — | Owner commit permission |
| P0 | P0-03 Secrets scan | Repo Hygiene | DONE | `scripts/qa-secret-scan.sh` PASS; `supabase/.temp` gitignored | — |
| P0 | P0-04 Protocol v1.2 + board | Lead | DONE | `MULTI_AGENT_PROTOCOL.md` v1.2, this table | — |
| P0 | P0-05 Inventory | Docs | DONE | `docs/PRE_DEPLOY_INVENTORY.md` | — |
| P1 | P1-01..09 Auto gates | QA | PARTIAL | `artifacts/pre-deploy/last-run.json` PASS=7 FAIL=0 (export/xcode/admin-build SKIP) | Re-run full `qa:predeploy` for export/xcode |
| P1 | P1-08 `qa:predeploy` | QA | DONE | `scripts/qa-predeploy.sh` + `npm run qa:predeploy[:fast]` | — |
| P2 | P2-* Backend local | Supabase | PENDING | — | Docker/local supabase |
| P3 | P3-* Contract matrix | Contract | CODE_AUDITED | `docs/CONTRACT_MATRIX.md` + online create session gate | Hosted E2E TODO-LIVE |
| P4 | P4-* UI/a11y matrix | UX + Expo | PENDING | — | Device for a11y |
| P5 | P5-* Visual Surface field | AR + QA | PENDING | — | Physical iPhone |
| P6 | P6-* Admin smoke | Admin | PENDING | — | — |
| P7 | P7-* Security/legal | Security | PENDING | — | Live legal URLs (owner) |
| P8 | P8-* Perf/offline/Sentry | Expo + QA | PENDING | — | Sentry DSN optional |
| P9 | P9-* Maestro + unit | QA | PENDING | — | Simulator access |
| P10 | P10-* Hosted staging | Supabase | PENDING | — | Project link (owner) |
| P11 | P11 Online E2E golden | Contract + QA | PENDING | — | D1 up |
| P12 | P12 Store/TestFlight | Release | PENDING | — | D1 + legal |
| P13 | P13 Go/No-Go | Lead + Owner | PENDING | `artifacts/pre-deploy/GO_NO_GO.md` | Prior phases |

**Active campaign claim:** Grok (Lead) — Wave 0 foundation (P0 + P1 scaffold). Files: protocol, workboard, decisions, scope, docs inventory/contract, `scripts/qa-predeploy.sh`, `package.json`, `artifacts/pre-deploy/*`.

## Active File Claims

| Agent | Task | Files claimed | Started | Status |
| --- | --- | --- | --- | --- |
| Codex | Architecture gap closure + Docker/Supabase hardening | `App.tsx`, `src/navigation/*`, `src/store/appStore.ts`, `src/services/{socialService,mediaEmbed,externalLinks}.ts`, media/open-link components, `supabase/config.toml`, new migrations, `scripts/supabase-*.mjs`, tests/docs | 2026-08-09 | DONE |
| Grok (Grok Build) | Loci_AR_Proje_Gorselleri birebir UI/UX parite | `App.tsx`, `src/components/*`, `src/screens/*-premium.tsx`, `src/screens/ARCameraScreen.tsx`, `src/screens/CreateTagScreen.tsx`, `src/components/ARPlaybackControls.tsx` | 2026-07-14 | HANDOFF |
| Lead Orchestrator | Multi-agent protocol hardening | `AGENTS.md`, `MULTI_AGENT_PROTOCOL.md`, `AGENT_WORKBOARD.md`, `DECISIONS.md` | 2026-07-07 | HANDOFF |
| Lead Orchestrator | App Store MVP plan implementation foundation | `README.md`, `FIELD_TEST_CHECKLIST.md`, `APP_STORE_RELEASE_CHECKLIST.md`, `src/types.ts`, `supabase/*`, `admin/*` | 2026-07-07 | HANDOFF |
| Grok (Grok Build) | Embedded AR platform content + low-token Codex handoff prep | `AGENT_WORKBOARD.md`, `AGENTS.md`, `README.md`, `src/screens/ARCameraScreen.tsx`, `src/store/appStore.ts` | 2026-07-08 | HANDOFF |
| Grok (Grok Build) | Continue Codex AR handoff: like/comment UX + platform embed | `src/screens/ARCameraScreen.tsx`, `src/screens/CreateTagScreen.tsx`, `src/types.ts`, `src/components/EditComposition.tsx` | 2026-07-09 | HANDOFF |
| Grok (Grok Build) | Estetik + UX journey plan P0–P3 | `App.tsx`, `src/components/*`, `src/screens/*`, `src/constants/theme.ts`, `src/constants/copy.ts` | 2026-07-09 | HANDOFF |
| Codex | Social discovery color system | `src/constants/theme.ts`, `src/components/Button.tsx`, `src/screens/MapScreen.tsx`, `AGENT_WORKBOARD.md` | 2026-07-17 | HANDOFF |
| Codex | Premium iOS Home/Discover implementation | `App.tsx`, `app.json`, `src/screens/MapScreen.tsx`, `src/screens/DiscoverScreen.tsx`, `src/constants/theme.ts`, `docs/RESEARCH_AR_SOCIAL.md`, `AGENT_WORKBOARD.md` | 2026-07-17 | HANDOFF |
| Codex | iOS native dev-client infrastructure | `package.json`, `eas.json`, `scripts/*`, `IOS_SIDELOAD_TESTING.md`, `FIELD_TEST_CHECKLIST.md`, `APP_STORE_RELEASE_CHECKLIST.md`, `README.md`, `AGENT_WORKBOARD.md` | 2026-07-19 | HANDOFF |
| Codex | Premium design-system and mobile UX rollout | `App.tsx`, `app.json`, `src/constants/*`, `src/theme/*`, `src/components/*`, `src/screens/*`, `docs/*`, `package.json`, `AGENT_WORKBOARD.md` | 2026-07-22 | HANDOFF |
| Codex | Persistent native world-lock completion | `modules/lociar-world-lock/*`, `src/services/ar/*`, `src/components/NativeWorldLockSurface.tsx`, `src/screens/CreateTagScreen.tsx`, `src/screens/ARCameraScreen.tsx`, `src/types.ts`, `docs/RESEARCH_AR_SOCIAL.md`, `AGENT_WORKBOARD.md`, `DECISIONS.md` | 2026-07-22 | HANDOFF |
| Codex | Camera-first cinematic visual direction | `App.tsx`, `src/constants/theme.ts`, `src/screens/ARCameraScreen.tsx`, `src/screens/CreateTagScreen.tsx`, `src/screens/map-screen-premium.tsx`, `src/screens/discover-screen-premium.tsx`, `src/screens/profile-screen-premium.tsx`, `src/screens/activity-screen-premium.tsx`, `src/components/*`, `docs/RESEARCH_AR_SOCIAL.md`, `AGENT_WORKBOARD.md` | 2026-07-22 | HANDOFF |
| Codex | Full reference-layout visual parity pass | `App.tsx`, `src/constants/theme.ts`, `src/screens/*-premium.tsx`, `src/screens/ARCameraScreen.tsx`, `src/screens/CreateTagScreen.tsx`, `src/components/CinematicBackdrop.tsx`, `docs/RESEARCH_AR_SOCIAL.md`, `AGENT_WORKBOARD.md` | 2026-07-22 | HANDOFF |
| Codex | Physical iPhone strict AR surface-lock verification | `modules/lociar-world-lock/*`, `src/types.ts`, `src/services/ar/{anchorManager,worldLockQuality}.ts`, `src/screens/CreateTagScreen.tsx`, AR tests, `docs/RESEARCH_AR_SOCIAL.md`, `FIELD_TEST_CHECKLIST.md`, `artifacts/pre-deploy/field-ar/2026-08-23/*` | 2026-08-23 | HANDOFF |
| Codex | Remove screen-space post rendering; bind shared content to selected floor anchor | `src/screens/ARCameraScreen.tsx`, `modules/lociar-world-lock/*`, `src/components/NativeWorldLockSurface.tsx`, AR tests/research/evidence | 2026-08-23 | HANDOFF |
| Grok (Grok Build) | Tap blue ARKit plane, then attach image/post on native iOS | `modules/lociar-world-lock/*`, `src/components/NativeWorldLockSurface.tsx`, `src/screens/ARCameraScreen.tsx`, `src/screens/CreateTagScreen.tsx`, `src/services/ar/anchorManager.ts`, AR tests/research | 2026-08-24 | HANDOFF |

## Current Queue

| Priority | Owner | Task | Acceptance Criteria | Status |
| --- | --- | --- | --- | --- |
| P0 | QA and Release | Run physical iOS native/sideload field test | `FIELD_TEST_CHECKLIST.md` completed with pass/fail notes after `.ipa` install | WAITING_ON_APPLE_EAS |
| P0 | Expo Mobile + UX | Fix any device-only camera/editor/map issues from field test | Reported field blockers fixed and iOS export passes | WAITING_ON_DEVICE |
| P0 | AR Geometry | Validate Anchor Manager fallback on iPhone | Saved post includes `pose.anchor` and AR screen shows tracking warning/state | WAITING_ON_DEVICE |
| P1 | Supabase Security | Smoke test local Supabase schema/RPC/function path | `supabase status`, lint, and at least one protected-zone/create-path smoke test recorded | DONE |
| P1 | Supabase Security | Validate mobile Storage upload path on real Supabase auth session | Upload failures handled and cross-device image render works | WAITING_ON_PROD_SUPABASE |
| P1 | Admin Dashboard | Deploy and smoke-test Supabase MFA/RBAC/audit foundation | No service-role path can be reached by public browser users; AAL2 writes and audit verified | IMPLEMENTED_LOCAL_WAITING_DEPLOY |
| P2 | QA and Release | Add automated tests for validation and pose math | Test command documented and passing | BACKLOG |
| Recurring | Research Analyst | Deep external scan of AR (Viro/ARKit) + social (IG Stories/TikTok) code for quality ideas. Update RESEARCH doc + propose integrations. | Fresh findings appended + 1-2 actionable proposals per cycle | ONGOING |

## Blockers

| Blocker | Owner | Needed Decision or Action | Status |
| --- | --- | --- | --- |
| Physical iPhone validation not yet recorded | Kagan + QA and Release | Strict indoor plane detection/lock is recorded; complete outdoor, low-light, drift, and persistence scenarios | PARTIAL |
| Production Supabase project not deployed | Supabase Security | Owner chooses project/env and deploy timing | OPEN_EXTERNAL |
| SMS auth intentionally disabled | Lead Orchestrator | Owner explicitly re-enables when ready | EXPECTED |
| Visual Surface physical resolve validation | AR Geometry + Kagan | Unlock the connected iPhone, capture one detailed surface, publish, then resolve it from a second framing/device | OPEN_DEVICE |
| iOS signing credentials | QA and Release + Kagan | Team `ZSRUTGX74S` signed the device build successfully | RESOLVED |
| Native dev client on iPhone | QA and Release | Latest signed build installed on Kağan iPhone’u | RESOLVED |

## Handoff Log

### 2026-08-24 - Grok - Strip Expo/Metro/RN; ship native iOS only

Changed:
- New SwiftUI + ARKit app in `ios/LociAR.xcodeproj` (`xcodegen` from `ios/project.yml`).
- Camera: light-blue plane, tap to lock, Photos picker, RealityKit image on the selected floor.
- Deleted Expo/Metro/React Native mobile tree: `App.tsx`, `src/`, `modules/`, `package.json`, `node_modules`, `eas.json`, Expo Docker/QR/scripts, `admin-mobile`.
- Admin (`admin/`) and Supabase stay.

Verification:
- `xcodebuild` Debug iOS Simulator **BUILD SUCCEEDED** (CODE_SIGNING_ALLOWED=NO).

Evidence: `ios/LociAR.xcodeproj` build. Physical iPhone run still required for ARKit planes.

### 2026-08-24 - Grok - Tap blue surface, then place image/post on ARKit plane

Changed:
- Native `ARView` tap raycast on `existingPlaneGeometry`. Selected plane gets the stronger blue fill; content is parented to that `AnchorEntity`.
- Camera tab no longer mounts Expo `CameraView` and no longer auto-raycasts screen center. User must tap the light-blue floor.
- Create pin uses the same tap. Center-reticle `0.5, 0.58` is no longer the lock gesture. Pin floor button remains a fallback.
- Overlay matches the placed-state card: "Yüzey bulundu" then "Yüzey bulundu. İçerik hazır."

Verification:
- `npx tsc --noEmit` passed.
- Jest passed 21 suites / 104 tests.

Evidence: code + Jest. Physical iPhone rebuild of `lociar-world-lock` is still required because Swift tap handling is native.

### 2026-08-23 - Codex - Strict ARKit plane lock + light-blue field on physical iPhone

Changed:
- ARKit plane extents now render as a translucent light-blue field; the selected surface receives a stronger blue fill and cyan boundary.
- Only `existingPlaneGeometry` / `existingPlaneInfinite` raycasts can produce `AR lock OK`; estimated/front-of-camera/sensor paths are rejected as physical locks.
- RealityKit content planes now use ARKit's XZ surface orientation instead of standing perpendicular to the detected plane.
- Persisted `storage://` media markers are normalized before React Native Image renders them; the physical red-screen crash is fixed.
- Demo/seed identifiers are stored as anonymous analytics identifiers instead of being sent to UUID columns.

Verification:
- Signed Debug build succeeded with zero warnings/errors on Kağan iPhone’u, iPhone 14 Pro Max, iOS 26.6.
- Physical XCTest passed 1/1: normal tracking, visible light-blue plane guide, surface tap, strict `Surface locked`; approximate and sensor alerts forbidden.
- TypeScript passed; Jest passed 18 suites / 92 tests; dependency check and `git diff --check` passed.

Evidence:
- `artifacts/pre-deploy/field-ar/2026-08-23/PhysicalDeviceBuildBlueSurface4.xcresult`
- `artifacts/pre-deploy/field-ar/2026-08-23/PhysicalARUITestBlueSurfaceVerified3.xcresult`
- `artifacts/pre-deploy/field-ar/2026-08-23/PhysicalARUITestBlueSurfaceVerified3Attachments/`

### 2026-08-09 - Codex - Permission-safe Explore-first launch

Changed:
- Normal launch and onboarding completion now land on Explore (`Discover`), with lazy tab mounting so Camera/AR starts only after an explicit Camera tab, AR CTA, or camera deep link.
- Onboarding uses shared copy and does not request camera/location permission.
- Store-like hydration replaces mock identity with guest state and removes persisted bundled `seed-*` catalog entries.
- Updated user flow, wireflow, state, navigation, deep-link, error, cache/sync, launch-contract, QA, screen spec, and Maestro launch coverage.

Verification:
- `npx tsc --noEmit` passed.
- Jest passed: 15 suites / 77 tests.
- Expo SDK 54 dependency check passed using the local dependency map.
- Native iOS Simulator `xcodebuild` passed.
- `git diff --check` passed.

Evidence: current Codex task output; physical iPhone permission-sheet validation remains a device QA gate.

### 2026-08-09 - Codex - Location-independent public profile previews

Changed:
- Added block-aware Supabase RPCs for active/public/non-18+ creator posts and individual post previews without a proximity requirement.
- Added explicit public-profile and post-preview routes; creator handles in Explore, Place Detail, and AR metadata now open profiles.
- Kept physical proximity as a separate “View in AR” action.
- Added preview rendering for surface textures, drawing/text/image layers, uploaded video, YouTube, Spotify, image media, and restricted-platform external fallbacks.
- Added the consolidated 15-diagram UI/UX, frontend, backend, API, push, database, and cache/sync architecture package.
- Made fetched profile posts part of the shared cache and added rollback behavior for failed optimistic social mutations.

Verification:
- `npx tsc --noEmit` passed.
- Jest passed: 15 suites / 75 tests.
- Expo SDK 54 dependency check passed using the local dependency map.
- Native iOS simulator `xcodebuild` passed.
- `git diff --check` passed.

Evidence: command output recorded in the 2026-08-09 Codex task.
Local migration runtime check remains external: Supabase CLI could not inspect containers because Docker/Podman is not available on PATH.

### 2026-08-06 - Grok (Lead) - Policy A online path hardening

Changed:
- Owner-confirmed **Auth Policy A** (SMS off) in DECISIONS + scope.
- Online create requires **live Supabase session**; mockup `demo-miles` / guest blocked (`isLocalDemoIdentity`).
- `enableLocalTestAccess` blocked when remote on / demo tools off.
- EAS profiles: SMS false; preview/production demo tools off + force pending; Visual Surface on.
- `.env.example`, `docs/ONLINE_GO_LIVE.md`, filled `CONTRACT_MATRIX.md`.
- Unit tests `auth-policy-online.test.ts` (13 suites / 66 tests total).

Verification: `tsc` clean; jest 66 pass; `qa:predeploy:fast` PASS=7 FAIL=0.

Evidence: `artifacts/pre-deploy/last-run.json`

Next: Owner links hosted Supabase → `db push` + functions → online golden path; Docker for local supabase if desired; field Visual Surface.

### 2026-08-06 - Grok (Lead) - Pre-deploy Wave 0 foundation

Changed:
- Scope freeze synced: `docs/APP_STORE_1_0_SCOPE.md` (Visual Surface primary, Auth Policy A default, D0/D1/D2).
- Decisions: 2026-08-06 Pre-Deploy Scope Freeze + Evidence Rule.
- Multi-agent protocol **v1.2** (SDK 54 only, exclusive zones, evidence rule, campaign agents).
- Workboard Pre-Deploy Campaign table (P0–P13).
- Inventory + contract skeleton: `docs/PRE_DEPLOY_INVENTORY.md`, `docs/CONTRACT_MATRIX.md`.
- `npm run qa:predeploy` / `qa:predeploy:fast` + secret scan scripts.
- Fixed admin security contract glob on paths with spaces (`admin/tests/security-contract.test.mjs`).
- Gitignore `supabase/.temp/` local CLI secrets.

Verification:
- `npm run qa:predeploy:fast` → PASS=7 FAIL=0 SKIP=4 (export/xcode/admin-build/supabase skipped by design).
- Admin security tests 6/6 pass.

Evidence: `artifacts/pre-deploy/last-run.json`, `artifacts/pre-deploy/gates/*`

Next recommended:
1. Owner: confirm Auth A vs B; allow git commit packaging (P0-02).
2. Full `npm run qa:predeploy` (export + xcode + admin build).
3. P2 local Supabase smoke when Docker up.
4. P3 fill CONTRACT_MATRIX with code audit.
5. P5 field Visual Surface on device.

### 2026-07-30 - Codex - Maestro UI readiness foundation

Changed:
- Added stable `testID` hooks for the main tab bar, Camera controls, Create/Pin Surface, caption/publish inputs, Map, Explore, Activity, Profile, Collections, and Place Detail.
- Added Maestro iOS flow files for smoke, tab screenshots, Create/Pin/Publish, keyboard caption, and profile/collections/place checks.
- Added `test:ui:maestro`, `qa:ios:sim-build`, and `qa:ios:launch-check` scripts.
- Made Pin Surface failures visible through a persistent recovery message so blank/featureless visual-surface failures are not silent.
- Re-scanned Expo SDK 54 Camera, React Native Keyboard, Gesture Handler, and Maestro docs and appended the findings to `docs/RESEARCH_AR_SOCIAL.md`.

Verification:
- TypeScript passed.
- Jest passed: 12 suites / 60 tests.
- Expo dependency check passed using the local SDK 54 dependency map.
- `git diff --check` passed.
- Installed the official mobile.dev Maestro CLI 2.7.0 via Homebrew tap and verified the CLI help/version with Java 26.

Blocked:
- Xcode simulator build and Maestro flow execution could not complete in this Codex sandbox because CoreSimulatorService access was invalid/hanging. Re-run from a normal terminal/Xcode session or after restarting CoreSimulator.

### 2026-07-30 - Codex - iOS caption keyboard dismissal

Changed:
- Caption fields now dismiss on the iOS Done key.
- The create sheet dismisses the keyboard interactively on drag, when switching workflow steps, and before Pin Media/Publish actions.

Verification:
- TypeScript passed.
- Create layout/Pin test suite passed with a keyboard-dismissal regression check.
- Connected iPhone reloaded the bundle; no new runtime error appeared.

### 2026-07-29 - Codex - Fully digital Visual Surface lock

Changed:
- Added ARKit-independent iOS Vision surface analysis and homographic image matching to the native Expo module.
- Made markerless `visual_surface` capture the primary Pin Surface path; no physical QR/AprilTag or ARWorldMap is required.
- Added provider-neutral mobile/server/DB contracts for `vision`, `visual_surface`, and `visual_surface_locked`.
- Added live camera reference matching in AR Camera with confidence-driven alignment and safe “frame the same textured surface” recovery.
- Kept ARKit world maps as an optional compatibility/precision resolver.
- Rewrites `refImageUri`, anchor bundle, resolver assets, and calibration to the uploaded HTTPS reference so cross-device resolve never depends on the creator iPhone's temporary `file://` URL.
- Added rate-limited development diagnostics for texture score, confidence, feature distance, and match center without logging image data.

Verification:
- TypeScript passed.
- 12 Jest suites / 54 tests passed, including Visual Surface readiness, serialization, and uploaded-reference propagation.
- Xcode simulator and signed physical-iPhone builds passed.
- Local Supabase migration applied; authenticated Edge Function smoke created a `visual_surface_locked` post with provider `vision`.
- New build installed and launched on Kağan iPhone’u; no startup/native crash observed.
- Final signed build installed again from `/tmp/lociar-visual-final`; launch was blocked only because the device screen was locked.

Field gate:
- Capture and resolve the same detailed surface on the physical iPhone, then tune Vision confidence/transform thresholds from real samples.

### 2026-07-29 - Codex - Local Supabase pre-deploy validation

Changed:
- Installed Docker Desktop in the user Applications directory and installed the Supabase CLI through Homebrew.
- Started the local Supabase stack on the repository's `563xx` ports; all migrations apply cleanly from an empty database.
- Found that `service_role` lacked PostgreSQL privileges on `public` tables, causing the server-only `create_post` Edge Function to return `500 permission denied for table posts`.
- Added `20260729201500_service_role_server_grants.sql`; the role remains server-only and now has the table/sequence/function grants required by Edge Functions and the server admin API.

Verification:
- Local schema/RLS/Storage check passed (core tables, four post RLS policies, and required buckets present).
- `create_post` rejects unauthenticated and invalid requests, creates valid posts as `pending_review`, rejects `18_plus`, and hard-blocks protected zones.
- Root TypeScript + 11 Jest suites / 50 tests passed.
- Admin TypeScript + 6 security contract tests passed; Next production build passed.
- iOS Expo export passed.

Remaining external gates:
- Link and deploy the selected hosted Supabase project; use the production project ref only after a backup and migration review.
- Provide real Sentry DSN/project and Privacy, Terms, and Support URLs.
- Complete signed physical-iPhone and two-device AR field validation.

### 2026-07-26 - Codex - iOS build and production admin foundation

Changed:
- Created branch `codex/production-admin-foundation` without resetting the existing dirty worktree.
- Set Expo public platforms to iOS-only, disabled iPad support for the v1 portrait target, corrected the SDK 54 protocol link, and added a portable macOS/Xcode Node resolver plus iOS preflight script.
- Added production admin RBAC roles/permissions, role assignments, MFA session model, independent approval requests, immutable audit/metric history, tracked invitations, DB-backed rate limits, trash metadata, user enforcements, and transactional RPCs for post moderation, raw metric editing, approval decisions/execution, and invalidation.
- Rebuilt the Next admin around magic-link + TOTP MFA, permission-aware protected routes, responsive operations navigation, truthful KPI instrumentation states, user/post/approval/audit screens, user invitations, post trash/restore/moderation, and raw counter controls.
- Removed the legacy direct service-role Server Action. Admin writes now use same-origin `/api/admin/v1/*` endpoints with reason, UUID idempotency, rate limiting, permission checks, and MFA `aal2`.

Verification:
- Root TypeScript passed.
- 11 Jest suites / 47 tests passed.
- Expo config reports `platforms: ['ios']` and `supportsTablet: false`.
- Expo dependency check passed using the local SDK 54 map (network-disabled warning recorded).
- iOS Expo export passed.
- Next admin TypeScript and production build passed.
- Admin security contract tests passed: 6/6.
- Xcode `LociAR` simulator build passed after compiling Swift/Pods.

External gates:
- Hosted Supabase is not linked in this checkout; migration/RLS smoke testing still requires the owner’s production project.
- Apple signing and two-physical-iPhone AR field validation remain open.
- Admin phases for full moderation cases, anchors/places/zones, flags/system health, support/notifications, and ads/finance remain queued.

### 2026-07-24 - Grok - Expo Go retired; native builds only

Changed:
- Product target is native iOS/Android only (`expo run:*` / EAS). Expo Go is no longer a supported runtime.
- `NATIVE_WORLD_LOCK_ENABLED` defaults to **true**; `.env.example` updated.
- Anchor manager prioritizes ARKit/ARCore raycast; sensor estimate is emergency fallback with recalibration messaging.
- Renamed helper to `createSensorFallbackSurfaceAnchor` (legacy `createExpoGoSurfaceAnchor` alias kept).
- Copy/docs: AGENTS, DECISIONS, README, `docs/AR_WORLD_LOCK.md`, field checklists, sideload notes.
- `npm start` remains Metro **dev-client** only (no Expo Go workflow).

Verification: run `npx tsc --noEmit` + `npm test` after merge.

### 2026-07-24 - Grok - Platform separation + iOS mockup parity first

Changed:
- **Platform folders:** `platforms/ios/` and `platforms/android/` for docs, scripts, screenshots; `src/platform/` for runtime knobs; native `ios/` generated via `expo prebuild --platform ios --no-install` (alongside existing `android/`).
- **Visual source of truth:** dense Downtown LA / Ace Hotel seed catalog in `src/constants/mockupSeed.ts` (storage key v4) matching `Loci_AR_Proje_Gorselleri`.
- **Map:** default region is DTLA (was Istanbul); miles distances; dark map chrome.
- **Profile:** always shows mockup profile layout with demo identity (`@miles.wyatt`); auth moved to Account section (no full-screen auth wall).
- **Activity / Explore / Profile copy:** English labels matching mockups; count format K not B.
- **package.json scripts:** clear `ios:*` vs `android:*` groups; iOS preflight paths under `platforms/ios/scripts/`.

Verification:
- `npx tsc --noEmit` passed.
- `npm test -- --ci --runInBand` passed: 4 suites, 21 tests.
- `ios/` Xcode project present (`LociAR.xcodeproj`, Podfile).

Next (iOS finish on device):
1. Install modern Ruby + CocoaPods, then `cd ios && pod install`.
2. `npm run ios` or EAS dev client on physical iPhone.
3. Capture screenshots into `platforms/ios/screenshots/` vs mockup pack.
4. Android track remains secondary until iOS visual accept.

### 2026-07-22 - Grok - Native Android (no Expo Go) + mockup camera chrome

Changed:
- Built and installed real package `com.khankartal.lociar` debug APK with `lociar-world-lock` (not Expo Go).
- APK artifact: `artifacts/lociar-android-debug.apk`; install notes: `FIELD_TEST_ANDROID_NATIVE.md`.
- Default workflow scripts: `start` → `--dev-client`, `android:apk` / `android:install`.
- `.env`: `EXPO_PUBLIC_NATIVE_WORLD_LOCK_ENABLED=true`.
- AR Camera: mockup hub always visible (header, reticle, dock, shutter); camera/location failures are soft overlays + optional demo preview frame — no full-screen blank error that hides chrome.
- Field checklist for physical ARCore phone + visual parity table.

Verification: `tsc` + 20 tests green. Emulator flaky; physical USB device required for world-lock field proof.

### 2026-07-14 - Grok (Grok Build) - Loci_AR_Proje_Gorselleri visual/functional parity pass

Changed:
- Shared chrome: `AppChromeHeader`, `LocationPill`, `ARReticle`, `AuthorMetaCard`, `ModeToolDock`, `CameraShutterBar`, `GlassSheet`.
- Tab bar: floating glass pill with Camera / Map / Explore / Activity / Profile icons matching mockups.
- AR Camera hub: Gallery/Post/Draw/Social dock, cyan shutter row, reticle, floating author card, “Kontroller telefonda”, mode-routed Create.
- Create modes: distinct step-2 UIs (gallery image tools, post note/color/visibility, draw brush sheet, social platform+media) via `mockupParity` helpers; pin path preserved.
- Map: clusters via `buildPlaceClusters`, category chips, Nearby places list with Open in AR.
- Discover: search, 5 category chips, Featured Location, Popular Walls, Fresh posts; sort via `sortDiscoverPosts`.
- Activity: All/Interactions/Nearby/Follows filters + richer rows.
- Profile: avatar/bio/stats glass cards, Posts·Map·Collections tabs, collections/notes placeholders.
- Playback: full seek bar + ±10s / play / mute / expand transport.
- Tests: `src/__tests__/mockup-parity.test.ts` for cluster/sort/mode routing pure helpers.

Verification:
- `npx tsc --noEmit` passed.
- `npm test -- --ci --runInBand` passed: 4 suites, 19 tests.
- `npx expo export --platform ios --clear` passed.

Remaining vs mockups:
- Collections is Profile tab, not full dedicated route.
- Create remains multi-step under mode sheets (not separate full-screen routes).
- Social graph mock/local; device screenshot QA optional.

### 2026-07-22 - Codex - Full reference-layout visual parity pass

Changed:
- Added a unified cinematic stage shared by discovery, activity, and profile: a darkened live-content backdrop with cyan ambient light and readable continuous-radius glass surfaces.
- Replaced the stock tab bar with the reference-style rounded five-destination AR navigation surface.
- Extended Profile with glass stat panels, post tiles, and collection cards; Discovery and Activity now preserve the same scene-overlays-content hierarchy.
- Tightened AR playback surfaces and editor selection feedback to use the same cyan glow, rounded translucent control language, and camera-first hierarchy.
- Re-scanned AR/camera/social-editor research before the changes and recorded the applicable visual constraints.

Verification:
- `npx tsc --noEmit` passed.
- `npm test -- --ci --runInBand` passed: 3 suites, 9 tests.
- `npx expo export --platform ios --clear` passed.

Note:
- An original non-camera gallery background asset was attempted with the image-generation service, but the service returned 403. The implementation therefore uses the app's own post/location imagery as the cinematic background source, with a safe charcoal fallback.

### 2026-07-22 - Codex - Camera-first cinematic visual direction

Changed:
- Reoriented primary navigation to Kamera, Harita, Keşfet, Aktivite, Profil; the existing creation flow remains available contextually from the camera surface.
- Replaced the gold action language with LociAR cyan-on-charcoal tokens, translucent chrome, cyan focus/glow, and restrained coral social feedback.
- Rebuilt the AR camera chrome around a centred Loci AR lockup, location surface, tracking status, contextual Fotoğraf/Gönderi/Çiz tools, and a prominent Duvara ekle action.
- Added the Activite screen and made map surface cards explicitly open in AR. Create now uses the same cyan placement direction.
- Appended a camera-first AR/social research scan with the camera, AR HIG, Viro, and social-editor constraints that informed the implementation.

Verification:
- `npx tsc --noEmit` passed.
- `npm test -- --ci --runInBand` passed: 3 suites, 9 tests.
- `npx expo export --platform ios --clear` passed.

### 2026-07-22 - Codex - Persistent native world-lock completion

Changed:
- Added a versioned persistence descriptor to the surface-anchor and post contracts; session-local native anchor IDs no longer qualify as persistent locks.
- iOS now archives the current `ARWorldMap`, restores it through `initialWorldMap`, recreates the saved RealityKit anchor entity, and exposes persist/resolve calls through the Expo native module.
- Android now enables ARCore Cloud Anchors, checks feature-map quality, hosts with a TTL, resolves saved Cloud Anchor IDs, and reports the restored anchor through the same native contract.
- Create persists a native anchor before publishing. AR playback resolves it before attaching text/image/video surface content.
- Added server-side resolver validation, expiry handling, recalibration fallback, persistence tests, current research notes, and `docs/AR_WORLD_LOCK.md` setup/field-test guidance.

Verification:
- `npm test -- --ci --runInBand`: 3 suites and 9 tests passed.
- `npx tsc --noEmit` passed.
- `npx expo export --platform ios --clear` and `npx expo export --platform android --clear` passed.
- `:lociar-world-lock:compileDebugKotlin` passed against ARCore 1.54.0.
- `npm run supabase:health`, `npm run supabase:smoke`, and `npm run supabase:edge-smoke` passed.

External gates:
- Compile and validate the Swift/RealityKit path with EAS/Xcode on a physical ARKit device.
- Enable the Google Cloud ARCore API and keyless authorization before testing the current 30-day Android Cloud Anchor TTL.
- The implemented iOS world-map file is same-device persistence; cross-device iOS needs private map transport or a common cloud/VPS resolver.

### 2026-07-22 - Codex - Premium design-system and mobile UX rollout

Changed:
- Added adaptive semantic light/dark theme tokens, persisted system/light/dark preference, motion/depth/touch contracts, and Reduce Motion/Transparency handling.
- Rebuilt shared Button, Card, Chip, Empty/StateView, and ARStatus contracts with accessibility states.
- Limited visible navigation to Harita, Keşfet, Oluştur, AR, Profil; owner Admin remains reachable from Profil as a hidden route.
- Rebuilt Harita so discovery remains usable without location permission; added Turkish search, recovery banner, selected-surface summary, and engagement tiles.
- Rebuilt Keşfet with explanatory filters, one immersive feature item, compact follow-up rows, and recovery-oriented empty state.
- Simplified AR chrome, changed camera permission to user-triggered JIT flow, combined tracking/battery/walking feedback into one prioritized status, and translated active controls.
- Updated Create progressive sheet/copy, replaced heavy long-press haptic, rebuilt onboarding without emoji, and rebuilt Profile as grouped settings with theme controls.
- Added product/design/component/screen/accessibility/QA/score documents and appended the 2026-07-22 AR/social research scan.
- Added jest-expo + React Native Testing Library with six token/component contract tests.

Verification:
- `npx tsc --noEmit` passed.
- `npm test -- --ci` passed: 2 suites, 6 tests.
- `npx expo install --check` passed after pinning React 19.1.0 for SDK 54.
- `npx expo export --platform ios --clear` passed.
- `npx expo export --platform android --clear` passed.

Remaining:
- Physical iPhone/iPad and Android device screenshots are still required for sunlight, camera orientation, large font, VoiceOver/TalkBack, and Reduce Motion evidence.
- Legacy Admin, low-level renderer, and parts of Create still contain documented dark-camera/technical raw values; continue token migration without changing renderer math.
- Web preview remains unavailable until `react-dom` and `react-native-web` are intentionally added; they were not added for a native-first project.
- Native Swift/Kotlin AR behavior still requires EAS/Xcode/Gradle and physical-device validation.

### 2026-07-09 - Grok (Grok Build) - Continue where Codex left (embedded + engagement)

**From where left off:** WORKBOARD told Codex: implement like + video embed, verify prioritization, keep Expo Go. Intermediate Grok sessions added editor gestures, Skia drawing, FlashList feed, research docs. Native world lock still not implemented (by design for Phase 1).

**Implemented this pass (Codex gaps closed):**
- AR Camera: real comment input (iOS `Alert.prompt`, Android inline comment box); Like shows live count; counts refresh from store after engagement.
- AR Camera: platform media embed while camera stays live — video platforms → WebView; thumbnail/fallback card for non-video; Spotify card + open-native CTA.
- AR Camera: still renders user `editData` layers on the surface; multi-at-spot still top-by-engagement only.
- Fixed double success haptics on unlock (single notification).
- Create editor: double-tap text now updates layer text (iOS prompt / Android draft save).
- Types: optional `ImageLayer.filter` preset; composition respects filter tint.
- Footer copy clarifies Expo Go sensor lock vs true world lock.

**Still open (not done this pass):**
- True native world lock / ARKit-ARCore bridge (`OPEN_NATIVE`).
- Physical iPhone field test / EAS credentials (owner blockers).
- Production Supabase + real remote comment/like sync when SMS/remote flags on.
- Deeper TikTok embed reliability (often WebView-blocked by platform).
- Real Skia ColorMatrix filters beyond tint approximation.

**Verification:** `npx tsc --noEmit` passes.

**Next recommended:**
1. Owner: run Expo Go smoke of Create → Map/Feed → AR unlock → Like/Comment → Open platform.
2. If embed flaky on device, fall back CTA-first for blocked platforms.
3. Only after Phase 1 field accept: open native world-lock bridge task.

### 2026-07-08 - Grok (Grok Build) - Embedded Platform Content Playback Refinement

**From where left off:** Previous Grok sessions focused on refining the AR viewing UX to match "embedded on wall" experience per user specs.

**Key Vision Updates (add to context for Codex/Claude):**
- AR Camera (when pose aligned): Content from platform (IG photo/video, YT, TikTok, X, FB, Spotify) plays **embedded directly in live camera feed on the 3D wall surface** (photo stuck on wall; video plays as texture/plane on wall; camera feed stays visible/active underneath for "real world + digital" feel). No leaving camera mode for initial view.
- In-app: After activate via camera or map, show likes/comments/views count for the post (in-app tracked + platform fetch where possible). Support like + comment in-app on the LociAR post.
- Switch: Tap username or "Open in [Platform]" to deep-link to native for full original likes/comments.
- Multi at location: AR camera shows **only the top engagement** (likes+comments+views) embedded. Others visible **only as map pins**.
- Map: All pins, **sorted by likes/engagement descending**. Click to preview/open.
- Users browse full catalog via map (even remote).
- All platforms (IG/FB/X/TikTok/YT/Spotify) supported the same: embedded in AR camera where possible.
- Engagement of shared content visible in-app post-activation.

**Code State vs Vision (for low-token resume):**
- Strong base: EditComposition renders layered custom edits (draw/text/gallery images with transforms). ARCamera positions it via pose deltas + prioritizes top by counts, shows counts, has open URL + comment.
- Map sorts by engagement.
- Gaps for embedded platform:
  - No video layer/render in composition or AR (only static images for pasted). Need: support 'video' layer or special case in ARCamera for contentSource video URLs (render positioned <Video> or WebView with url, while camera active).
  - contentSource exists in types, used in map callout for icon+open. AR currently renders editData (custom); for pure platform posts, may need to auto-create image layer or render contentSource media.
  - No explicit like button in AR (counts shown, incrementView on unlock; add like similar to comment).
  - Embedded "play on wall with camera live" for video not implemented (approximated by overlay frame).
- Use: For platform content, prefer setting contentSource + optional preview layer. Render media embedded in AR using video/image in the locked frame.
- Prioritization and map sorting already in code (good).

**Changes made this session (minimal for Codex context):**
- Updated plan.md (sessions) with exact UX for embedded playback, prioritization, in-app engagement, map sort, switch.
- (No breaking code changes yet; prepare docs first.)

**Recommendations for next (low token):**
- Read: AGENTS.md, this WORKBOARD, DECISIONS.md, README "Current State", ARCameraScreen.tsx, EditComposition.tsx, types.ts, MapScreen.tsx, postService.ts.
- Prioritize per WORKBOARD P0: field test.
- For embedded video: Extend types for video layer if needed, add render in ARCamera/Edit (use expo-av if added, or WebView for urls). Keep camera active.
- Add like button in AR action bar, wired to store increment.
- Ensure when posting platform, contentSource set, and AR can render from it or layer.
- Update AGENTS.md with "Embedded AR Playback" bullets if not.
- Test: Multiple at spot (top in camera), map sort, video urls if supported, engagement UI.
- Keep Expo Go MVP, no native yet.

**Token tip for Codex:** Load AGENTS + WORKBOARD + DECISIONS + README first (structured, < few k tokens), then specific code files. Avoid re-reading full plan unless needed.

Verification: Docs updated for handoff; no code yet in this pass.

Next for Codex: Run field test checklist, implement like + video embed support, verify prioritization.

### 2026-07-07 - Lead Orchestrator

Changed:
- Added durable multi-agent protocol.
- Added live workboard.
- Added decision log.
- Updated bootstrap instructions.

Verification:
- Documentation-only change. No runtime check required.

Risks:
- Workboard must be maintained; otherwise file-claim protection becomes stale.

Next:
- Start with the P0 physical iPhone field test.

### 2026-07-07 - Lead Orchestrator

Changed:
- Added App Store MVP operational checklists.
- Added production `pending_review` status path for Supabase creates.
- Added Storage bucket/policy foundation for post reference images and layer assets.
- Added admin pending review approval controls.
- Added production Basic Auth gate for the local Next.js admin scaffold.

Verification:
- Follow-up checks required: root typecheck, admin typecheck, Expo exports, Supabase lint.

Risks:
- Physical iPhone validation, production Supabase deploy, and App Store submission still require owner/external action.
- Mobile upload implementation is still the next P1 task; Storage policy foundation is present.

Next:
- Run full verification gates, then complete `FIELD_TEST_CHECKLIST.md` on iPhone.

### 2026-07-07 - Supabase Security / Expo Mobile

Changed:
- Added mobile Storage upload helpers for reference images and image layers when remote sync is enabled.
- Changed production remote create to remote-first so failed Supabase create does not silently create a local active post.
- Added mobile report insertion into `moderation_flags`.

Verification:
- Follow-up checks required after this handoff: root typecheck, admin typecheck, Expo exports.

Risks:
- Upload behavior still needs a real Supabase authenticated device session; local SMS-off mode intentionally skips remote sync.

### 2026-07-07 - Supabase Security

Changed:
- Added `npm run supabase:smoke` for transaction-rolled-back schema/RPC checks.
- Smoke test verifies `nearby_posts` returns active posts while hiding `pending_review`.
- Smoke test verifies `protected_zone_check`, Storage buckets, and Storage policies.

Verification:
- Run `npm run supabase:smoke`.

Risks:
- This does not replace a real authenticated mobile upload test.
| Codex | iOS premium MVP foundations and Home/Discover implementation | `App.tsx`, `app.json`, `src/constants/*`, `src/components/*`, `src/screens/*`, `src/store/appStore.ts`, `src/hooks/usePose.ts`, `src/services/*`, `docs/RESEARCH_AR_SOCIAL.md`, `AGENT_WORKBOARD.md` | 2026-07-14 | CLAIMED |

| Codex | Production-ready implementation: identity auth, owner operations, ARKit bridge, private admin IPA, release artifacts | `src/types.ts`, `src/services/*`, `src/screens/ProfileScreen.tsx`, `supabase/*`, `admin/*`, `admin-mobile/*`, `modules/lociar-world-lock/*`, `docs/*`, `AGENT_WORKBOARD.md` | 2026-07-17 | HANDOFF |


### 2026-07-17 - Codex - Production-ready foundation handoff

Changed:
- Added Apple, Google, and email magic-link auth contract, secure session restoration, verified identity create gating, logout, and in-app account deletion.
- Added production readiness migration for owner roles, campaigns, calibration state, audit logs, device push tokens, and AR-only query filtering.
- Repaired LociAR local Supabase stack: Edge Runtime now runs and the create_post Edge smoke passes.
- Replaced admin web Basic Auth with Supabase magic-link session + server-side owner allowlist. All status changes are audited.
- Added separate admin-mobile Expo app for internal IPA distribution with owner MFA, review actions, report/campaign/zone snapshots, campaign CSV drafts, and owner-only Edge actions.
- Added native iOS ARKit Expo module scaffold using ARRaycastQuery, ARAnchor lifecycle signals, and AVPlayer material for owned video assets. Expo Go remains explicitly fallback-only.
- Added Sentry initialization with PII scrubbing and release/legal artifact drafts.

Verification:
- npx tsc --noEmit
- npx expo install --check
- npx expo export --platform ios --clear
- cd admin; npm run typecheck
- cd admin; npm run build
- npm run supabase:health
- npm run supabase:smoke
- npm run supabase:edge-smoke

External gates remaining:
- Create and configure production EU Supabase, OAuth credentials, SMTP, MFA enablement, Sentry org/project, and secrets.
- Obtain domain, publish legal/support URLs, and update production environment values.
- Build/install native iOS and private Admin IPA through EAS with Apple credentials; then run the iPhone ARKit and field test checklists.


### 2026-07-17 - Codex - Premium UI + AR embedded playback handoff

Changed:
- Added platform media capability layer for chromeless YouTube/TikTok embeds and best-effort platform playback.
- Added `EmbeddedMediaSurface`, `ARMediaBar`, and `ARSocialBar` so playback controls live in the bottom area, not on the wall surface.
- Rebuilt `ARCameraScreen` as a premium utility viewer with clean tracking state, split media/social controls, and no visible video player controls on the surface.
- Cleaned Create editor toolbar into Lucide icon controls for pen, text, image, place, erase, undo, delete, and layer front actions.
- Extended the iOS ARKit local module contract with play/pause/seek/mute commands for owned AVPlayer video textures.
- Appended fresh SDK54/media/AR research notes before AR/editor changes.

Verification:
- `npx tsc --noEmit`
- `npx expo install --check`
- `npx expo export --platform ios --clear`
- Mojibake/emoji scan on changed Create/AR/media files returned no matches.

Remaining external checks:
- YouTube/TikTok WebView playback must be verified on physical iPhone/dev build because platform embed behavior can vary.
- Native `AVPlayer` texture controls require an EAS iOS build with the local `lociar-world-lock` module.

### 2026-07-19 - Codex - iOS native dev-client infrastructure

Changed:
- Added dev-client npm scripts for LAN/tunnel Metro, EAS whoami/devices/credentials, fresh iOS dev build, refreshed internal build, and iOS simulator smoke build.
- Updated EAS profiles so development/preview/production builds enable `EXPO_PUBLIC_NATIVE_WORLD_LOCK_ENABLED=true`; added a separate `development-simulator` profile for non-AR smoke only.
- Added `scripts/ios-dev-client-preflight.ps1` to verify EAS login, Expo deps, TypeScript, app/EAS config, native module scaffold, iOS export, and public secret exposure before Apple credentials are ready.
- Rewrote `IOS_SIDELOAD_TESTING.md` around the LociAR-specific dev client flow and Apple Developer handoff.
- Added native ARKit dev-client checks to `FIELD_TEST_CHECKLIST.md` and release evidence fields to `APP_STORE_RELEASE_CHECKLIST.md`.
- README Native AR Path now points to the dev-client preflight/build/start commands.

Verification:
- `npm run ios:dev-client:preflight` passes with network/escalated permissions.

Remaining external gate:
- Kagan must activate Apple Developer Program, then run `npm run build:ios:dev` interactively and complete Apple login/2FA/device registration.
### 2026-07-20 - Codex - Deep audit native AR bridge + production readiness pass

Changed:
- Added `NativeWorldLockSurface` React bridge so `LociarWorldLockView` is mounted before native AR raycast/session calls.
- Wired Create step 1 to use native AR surface capture in enabled dev/internal builds, with Expo Camera fallback when unsupported/disabled.
- Wired AR viewer to use native world-lock surface for `arkit_world_locked` / `arcore_world_locked` posts only when the native feature flag is enabled.
- Turned production `EXPO_PUBLIC_NATIVE_WORLD_LOCK_ENABLED` off by default in `eas.json`; dev/internal profiles remain enabled.
- Added placement quality, resolver strategy/assets, and native provider metadata to mobile types, create payloads, Supabase migration, `create_post`, and admin calibration.
- Preserved native placeholder reference URIs from Storage upload attempts until native frame capture is added.
- Appended fresh 2026-07-20 AR/Expo/social research notes.
- Restarted only the LociAR local Supabase stack and applied the new anchor resolver metadata migration.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo install --check` passed with network permission.
- `npx expo export --platform ios --clear` passed with Windows sandbox/cache permission.
- `npx expo export --platform android --clear` passed with Windows sandbox/cache permission.
- `npx expo-modules-autolinking resolve --platform apple` shows `LociarWorldLock`.
- `npx expo-modules-autolinking resolve --platform android` shows `expo.modules.lociarworldlock.LociarWorldLockModule`.
- `npm run supabase:health`, `npm run supabase:smoke`, and `npm run supabase:edge-smoke` passed after `supabase migration up`.
- `supabase db lint --local` exited 0; output still includes known PostGIS/extension lint noise.

Remaining:
- iOS native module still needs RealityKit `ARView` migration before final App Store AR quality.
- Android native module still needs real camera/render loop/textured quad renderer before Android world-lock is field-complete.
- Native AR frame/reference capture is not implemented yet; native capture currently stores a `native-ar-reference://` placeholder for local/dev flow.
- Physical iPhone/ARCore device tests are still required.

### 2026-07-20 - Codex - RealityKit + own video AR playback pass

Changed:
- Migrated the iOS `lociar-world-lock` view from SceneKit `ARSCNView` to RealityKit `ARView` with ARKit raycast, `AnchorEntity`, tracking-state events, and `VideoMaterial` for owned videos.
- Added `own_video` as a first-class content source platform and marked it as native-texture-preferred in media capabilities.
- Added Create flow video selection from the photo library; selected videos publish as `own_video` content sources.
- Added mobile upload support for owned videos through `post-video-assets` with an 80MB cap.
- Added Supabase `post-video-assets` bucket/policies migration and updated health/smoke scripts to require all 3 asset buckets.
- AR viewer now attempts native video texture attachment for native world-locked `own_video` posts; bottom media controls drive native play/pause/seek/mute when texture attachment succeeds, otherwise fallback media rendering remains.

Verification:
- `npx tsc --noEmit` passed.
- `supabase migration up` applied `20260720123000_post_video_assets.sql`.
- `npm run supabase:health`, `npm run supabase:smoke`, and `npm run supabase:edge-smoke` passed.
- `npx expo install --check` passed.
- `npx expo export --platform ios --clear` passed.
- `npx expo export --platform android --clear` passed.
- iOS and Android Expo autolinking still resolve `lociar-world-lock`.

Remaining:
- RealityKit Swift syntax must still be validated by an actual EAS/Xcode iOS native build; Windows export does not compile Swift.
- Android still needs a real ARCore camera/render loop and textured quad/video renderer before native world-locked video is complete on Android.
- Create native reference-frame capture is still placeholder-based for native capture mode.

### 2026-07-20 - Codex - Android ARCore camera render loop pass

Changed:
- Replaced the Android placeholder `FrameLayout` AR view with a `GLSurfaceView` renderer.
- Added an external OES camera texture and `Session.setCameraTextureName(...)` so ARCore frames are produced from a real render loop.
- Moved ARCore `Session.update()` into `onDrawFrame`, storing the latest frame for hit-test/raycast calls.
- Kept ARCore plane hit-test + anchor creation, now backed by the latest rendered frame rather than an immediate main-thread update.
- Android `own_video` native texture remains intentionally disabled; JS now only attempts native video texture attachment on iOS, so Android falls back safely.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo export --platform android --clear` passed.
- Android Expo autolinking still resolves `expo.modules.lociarworldlock.LociarWorldLockModule`.
- `npm run supabase:health` passed.

Remaining:
- Android Kotlin/OpenGL must be validated by an actual EAS/Gradle Android native build; Metro export does not compile Kotlin.
- Camera background orientation/UV transform may need physical-device adjustment after first ARCore build.
- Text/image/drawing native textured quad rendering is still not implemented on Android; current Android pass makes tracking/raycast/render-loop viable first.

### 2026-07-20 - Codex - AR render policy honesty pass

Changed:
- Added `src/services/ar/renderPolicy.ts` to separate three modes: native wall video texture, native tracking with overlay preview, and Expo sensor overlay.
- Updated AR viewer so native video attachment is driven by render policy, not scattered placement checks.
- Surface status/footer now explain whether the user is seeing native wall video, native tracking preview, or Expo sensor fallback.
- Appended research note documenting the ARCore render-loop direction and current Android native video limitation.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo export --platform android --clear` passed.
- `npx expo export --platform ios --clear` passed after rerunning alone due Windows metro-cache lock during parallel export.
- `npm run supabase:health` passed.

Remaining:
- Native text/image/drawing textured-plane renderers are still the next correctness step for true world-locked non-video content.
- EAS/Xcode/Gradle native builds are still required to compile Swift/Kotlin and validate camera orientation on devices.

### 2026-07-20 - Codex - Native static surface content safety pass

Changed:
- Added JS/native API surface for `attachText`, `attachImage`, and `removeSurfaceContent` in `lociar-world-lock`.
- iOS RealityKit can now attach a single text or image layer to the captured anchor as a wall plane.
- AR viewer only uses native static attach when the post has exactly one attachable text/image layer; multi-layer/drawing compositions stay on the overlay path to avoid hiding content.
- Android ARCore tracking events are throttled so the render loop does not spam React Native every frame.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo export --platform ios --clear` passed.
- `npx expo export --platform android --clear` passed.
- `npm run supabase:health` passed.
- iOS and Android Expo autolinking both resolve `lociar-world-lock`.

Remaining:
- Actual Swift/Kotlin compilation still requires EAS/Xcode/Gradle native builds; Windows Metro export does not compile native module code.
- Native multi-layer/drawing support should be implemented as a full composition texture, then attached to the anchor.
- Android still needs textured-plane rendering for image/text/drawing and later ExoPlayer video texture.
- Physical iPhone 14 Pro Max and ARCore device tests are still required for camera orientation, tracking quality, and drift checks.

### 2026-07-20 - Codex - Competitive AR quality gate pass

Changed:
- Added `src/services/ar/worldLockQuality.ts` for central AR readiness scoring and resolver strategy selection.
- Updated AR render policy so native AR rendering requires a quality-eligible native anchor, not just a claimed placement state.
- Updated Create publish flow to mark weak native captures as `recalibration_required` instead of blindly publishing them as world-locked.
- Hardened `create_post` so the Edge Function ignores client-provided placement quality, recomputes it server-side, and downgrades weak native anchor claims.
- Added migration `20260720160000_world_lock_quality_gate.sql` to require `placement_quality >= 0.72` in `nearby_ar_posts`.
- Appended competitive research findings from ARKit, ARCore, Snap Lens Studio, Lightship/8th Wall VPS, and Unity AR Foundation.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo install --check` passed.
- `npx expo export --platform ios --clear` passed.
- `npx expo export --platform android --clear` passed.
- `supabase migration up` applied `20260720160000_world_lock_quality_gate.sql` after rewriting the file without BOM.
- `npm run supabase:health`, `npm run supabase:smoke`, and `npm run supabase:edge-smoke` passed.

Remaining:
- EAS/Xcode/Gradle native builds are still required to compile Swift/Kotlin and validate true AR behavior on devices.
- Multi-layer/drawing posts need a native composition snapshot texture before they can be fully wall-locked without overlay fallback.
- Android still needs textured-plane rendering, then ExoPlayer texture for owned video.
- Reference-image/native frame capture should be implemented before any VPS/cloud-anchor phase.

### 2026-07-20 - Codex - Native composition texture pass

Changed:
- Added `react-native-view-shot` with Expo SDK 54-compatible install.
- Added `EditData.surfaceTextureUri`, `surfaceTextureAssetPath`, and `surfaceTexturePublicUrl`.
- Create publish now captures the full editor composition into a PNG surface texture before saving the post.
- Added `post-surface-textures` Supabase Storage bucket and policies.
- Upload pipeline now uploads the surface texture and stores its public URL in `edit_data`.
- AR viewer now prefers the full composition texture for native iOS wall rendering, falling back to single text/image attach only when no texture exists.
- Supabase health/smoke scripts now validate all 4 asset buckets.

Verification:
- `npx tsc --noEmit` passed.
- `npx expo install --check` passed.
- `supabase migration up` applied `20260720170000_surface_texture_bucket.sql`.
- `npm run supabase:health`, `npm run supabase:smoke`, and `npm run supabase:edge-smoke` passed.
- `npx expo export --platform ios --clear` passed.
- `npx expo export --platform android --clear` passed.

Remaining:
- Native Swift/Kotlin compile and physical-device AR validation still require EAS/Xcode/Gradle builds.
- Android still needs textured-plane rendering to display `surfaceTexturePublicUrl` as true AR content.
- Composition capture should be validated on real iPhone for transparency, Skia drawing inclusion, and image layer fidelity.
- Later: fixed-resolution/offscreen renderer for sharper texture quality than device-screen capture.

### 2026-07-20 - Codex - Android surface texture renderer pass

Changed:
- Implemented Android `attachImage` instead of throwing fallback.
- Added ARCore/OpenGL textured quad rendering for surface composition textures.
- Added background bitmap loading for http/file/content texture URIs and GL texture upload on the render thread.
- Added `onSurfaceContentReady` native event on iOS/Android and TypeScript bridge props.
- AR viewer now allows Android to attach `surfaceTextureUri/surfaceTexturePublicUrl`; overlay is hidden only after native content-ready event.

Verification:
- `npx tsc --noEmit` passed.
- Android Expo autolinking still resolves `expo.modules.lociarworldlock.LociarWorldLockModule`.
- `npx expo export --platform android --clear` passed.
- `npx expo export --platform ios --clear` passed.

Remaining:
- Windows Metro export does not compile Kotlin/Swift; Android textured renderer must be validated with EAS/Gradle on an ARCore-supported device.
- Android camera background UV/orientation may need physical-device correction.
- Android video texture remains separate; this pass handles static composition textures.

### 2026-07-20 - Codex - Android Studio/Gradle compile attempt

Changed:
- Ran `npx expo prebuild --platform android`; native Android project generated under ignored `/android`.
- Installed Android SDK packages needed by Android Studio: `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`, and `cmake;3.31.6`.
- Fixed Android local module Kotlin compile errors in `modules/lociar-world-lock/android/src/main/java/expo/modules/lociarworldlock/LociarWorldLockModule.kt`:
  - removed literal `` `r`n `` corruption in event declarations;
  - forced placeholder async functions to return `Unit` instead of inferred `Nothing`;
  - converted native event payloads from `Bundle` to `Map<String, Any>`.
- Added local Android build cache folders to `.gitignore`.

Verification:
- `:lociar-world-lock:compileDebugKotlin` passes.
- Full `assembleDebug` progresses past Kotlin/native module compile and app Java/Kotlin compile.

Blocked:
- CLI `assembleDebug` in this Codex/PowerShell session is blocked at `react-native-worklets:configureCMakeDebug[arm64-v8a]` because Ninja hangs while launching compiler commands during CMake ABI detection.
- Verified the NDK compiler itself works: direct `clang` compile/link succeeds.
- Verified simple Android CMake configure also hangs only when CMake invokes Ninja, so this is environment/Ninja process behavior, not LociAR Kotlin code.

Next:
- Open `C:\Users\Kagan\LociAR\android` in Android Studio and run Build/Make Project using the now-installed real Android SDK packages.
- If Android Studio also hangs at Ninja, reinstall/repair Android SDK CMake/NDK from SDK Manager or build on EAS/macOS/Linux CI.

### 2026-07-30 - Codex - iOS UI reliability and overlap pass

Changed:
- Corrected the custom iOS tab host height and removed duplicated screen-level tab/safe-area clearance.
- Measured Create top chrome and bottom sheet at runtime so the Pin Surface reticle cannot overlap either region.
- Scaled saved editor compositions into the Camera preview instead of rendering screen-space coordinates outside the AR card.
- Removed duplicate Camera author chrome and tightened the Camera controls into non-overlapping regions.
- Replaced broken Profile thumbnails with bounded placeholders and deterministic three-column card widths.
- Replaced silent More-button filter cycling with visible iOS action sheets.
- Removed fabricated Activity rows; empty activity now has an honest empty state.
- Added keyboard dismissal behavior to Explore, Profile, and Collections.
- Appended the required Expo 54, Apple, Gesture Handler, ARKit/Vision, ViroReact, and social UI research to `docs/RESEARCH_AR_SOCIAL.md`.

Verification:
- TypeScript passed.
- Jest passed: 12 suites, 57 tests.
- Expo SDK 54 dependency check passed using the local dependency map.
- `git diff --check` passed.
- Clean iOS Simulator Xcode build passed; Hermes and ReactNativeDependencies scripts passed.
- Eight active routes were rendered and captured under `artifacts/iphone-test-20260730`.
- Signed iPhone 14 Pro Max Xcode build and installation passed.
- Physical iPhone launch and Metro bundle load passed after unlocking the device.

Remaining:
- Physical gestures, camera tracking, caption keyboard, and Pin Surface publish still require a manual on-device interaction pass while logs are attached.
- The linked runtime Supabase URL reports missing post-schema migrations, but this checkout has no confirmed CLI production-project link; no remote migration was applied.
- iOS Simulator camera/CoreMotion messages are simulator limitations, not application crashes.
- The Expo/React Native native template emits iOS 26's future `UIScene` lifecycle adoption warning; it is not a current launch failure.
