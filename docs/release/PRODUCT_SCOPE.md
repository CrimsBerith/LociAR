# LociDrop 1.0 — Product Scope, User Journeys & Release Policy

> Phase: P0  
> Owners: A00 (Release Orchestrator), A01 (Product & Requirements Auditor), A14 (App Store Specialist)  
> Target Platform: iOS 17.0+ (iPhone only, arm64, ARKit capable)  
> Version: 1.0.0 (Build 1)  
> Date: 2 Kasım 2026  

---

## 1. Executive Summary & Vision

LociDrop is a location-anchored augmented reality (AR) social and community application. Users can discover, create, and interact with geolocated content tied to real-world coordinates and physical surfaces.

The app combines:
- **Surface-Anchored AR Experiences**: Text and KLIPY GIF bubble posts anchored in 3D physical space using ARKit and Google ARCore (Cloud Anchors & Geospatial VPS).
- **Location Notes**: On-site community notes with bounded reading radii (15–100 m), ranked by community appreciation, designed to share hyper-local context (e.g., historical facts, venue tips, venue amenities).
- **Cam Katman Glass Map**: A custom map interface displaying spatial density heat maps via a server-maintained spatial cell index (`map_cells`), preventing massive Firestore client scans.

---

## 2. In-Scope Features (v1.0 Release)

### 2.1 Authentication & Membership
- **Verified Identity Required**: Entering the application requires either Sign in with Apple (`ASAuthorizationAppleIDButton`) or Email One-Time Code (OTP) verification.
- **No Guest / Anonymous Auth Bypass**: Direct anonymous login is retired (owner decision, 28 Oct 2026). All active sessions must have a verified identity bound to a server-derived `luid` (UUIDv5 custom claim).
- **Public Authorship Choice**: Users may post anonymously (default) or attribute content to their verified handle. Regardless of the choice, the server enforces verified identity and guarantees independent blocking semantics without exposing the author's real identity.

### 2.2 AR Content Creation & Viewing
- **Media Format**: Text and/or one KLIPY GIF displayed as a chat-style bubble in 3D space.
- **AR Placement**: Center reticle raycast against ARKit detected plane geometry. Manual fine-tuning is bounded.
- **Relocalization Stack**:
  1. Google ARCore Cloud Anchors (365-day TTL, keyless server token exchange via `getArcoreToken`).
  2. Google ARCore Geospatial (VPS).
  3. Legacy ARKit world map.
  4. Aim-guided proximity reveal.
- **KLIPY Integration**: Search and media requests run on the iOS device. `getGifConfig` supplies `KLIPY_APP_KEY` to signed-in, App Check-verified clients. "Powered by KLIPY" attribution appears wherever search results appear.

### 2.3 Location Notes
- **Authoring Fix**: Location notes must be created at the user's measured GPS fix. Manually corrected pins cannot move more than 12 m from the GPS measurement.
- **Interaction Radii**: Admission and reading radius between 15 m and 100 m (`distance <= radius + min(accuracy, 20 m)`).
- **Spatial Grouping**: Fixed 6-metre cluster centers on map views to aggregate dense notes.
- **On-Site Reading Fence**: Note text from other authors is redacted by the server when queried from afar; full text is returned only when the viewer submits an authenticated, fresh on-site GPS/Geospatial fix.

### 2.4 Cam Katman Glass Heat Map
- **Server Spatial Index**: Queries read pre-aggregated `map_cells` documents rather than querying raw post collections.
- **Density & Clustering**: Stable heat gradient and 6 m cluster representations at high zoom.
- **Privacy Preservation**: Zooming does not unlock remote note contents. Account blocks and mute rules apply consistently to cell index projections.

### 2.5 Moderation, Safety & Compliance
- **Pre-Publishing Automated Screening**: `createPost` executes word filters, link rejection (all URLs blocked), protected zone boundary checks, and adult (18+) checks.
- **Post-Publishing Community Moderation**: Users can flag/report posts (`post-report`) and block users (`profile-block-user`) or anonymous authors (`anonymous_blocks`).
- **Automatic Report Thresholds**: Posts receiving threshold reports are automatically hidden pending administrator review.
- **Complete Account Deletion (App Store 5.1.1(v))**: Full hard deletion of Auth record, Firestore user document, profile data, and Storage assets, validated with Apple Sign-in authorization token revocation.

### 2.6 Localization & Accessibility
- **12 Languages**: Fully localized into English (`en`, development language), Turkish (`tr`), Simplified Chinese (`zh-Hans`), Hindi (`hi`), Spanish (`es`), French (`fr`), Arabic (`ar`), Bengali (`bn`), Portuguese (`pt`), Russian (`ru`), German (`de`), and Japanese (`ja`).
- **String Catalogs**: Managed via `Localizable.xcstrings` and `InfoPlist.xcstrings`. Zero unreviewed strings.
- **On-Device Translation**: Native Apple Translation framework (iOS 18+) for translating readable note text without cloud data exfiltration.
- **Accessibility**: VoiceOver accessibility identifiers on all key navigation, auth, and profile actions. Minimum 44x44 pt tap targets.

---

## 3. Explicitly Out-of-Scope (Non-Goals for v1.0)

| Item | Status | Justification / Owner Decision |
|---|---|---|
| **Creator Support Payments** | **HIDDEN in Release** | `PostSupportAvailability.releaseBuilds = false`. Entry points (note support button, profile earnings) are hidden in Release builds until payment provider contracts and regulatory agreements are completed (28 Oct 2026). Avoids App Review 2.1/3.1.1 blockers. |
| **User Media Uploads** | **REMOVED** | Device photo and video uploads retired (29 Sep 2026). Prevents uncurated media abuse and massive storage bandwidth costs. |
| **Social / External Links** | **BANNED** | External URLs (Spotify, YouTube, Instagram, X, TikTok) are strictly rejected by `createPost` (9 Oct 2026). |
| **SMS Phone Auth** | **DISABLED** | High telecom cost and carrier fraud vectors; Apple ID and verified Email OTP provide superior trust. |
| **Android / Web Mobile Client** | **NOT SUPPORTED** | Native iOS only (`LociAR.xcodeproj`, SwiftUI + ARKit + RealityKit). No Expo/React Native. |
| **Unverified Guest Publishing** | **REMOVED** | Prevents spam campaigns and coordinates spoofing; every publisher has an authenticated account. |

---

## 4. Support Matrix & Technical Constraints

- **Minimum iOS Version**: iOS 17.0 (Xcode 27.1 / Swift 6.0 toolchain).
- **Target SDK**: iOS 27.1 SDK.
- **Device Family**: iPhone only (`TARGETED_DEVICE_FAMILY = "1"`). iPad, Mac Catalyst, and visionOS are explicitly disabled in project configuration.
- **Required Hardware**: Device must support ARKit world tracking (A12 Bionic or newer, arm64).
- **Network Requirement**: Online connectivity required for authentication, Cloud Functions, and Firestore synchronization. Graceful offline degradation with cached tiles and user messaging.

---

## 5. Acceptance & Release Policy

A release candidate is accepted only if:
1. Debug and Release configurations compile cleanly without blocking warnings.
2. 100% of native unit tests (`LociARTests`) pass with zero unexpected failures.
3. UI automation smoke suite (`EnglishSmokeUITests`) passes on simulator.
4. Security secret scanner (`qa-secret-scan.mjs`) reports 0 findings.
5. All 12 localization catalogs pass validation (`check-localization.mjs --release`).
6. Cloud Functions and Admin test suites pass with 100% success.
7. Creator support payments remain completely inaccessible in production builds.
