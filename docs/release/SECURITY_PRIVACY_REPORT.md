# LociAR 1.0 — Security, Privacy & Apple Compliance Report

> Phase: P5  
> Owners: A07 (Security & Privacy), A13 (SDK Compliance), A14 (App Store Specialist)  
> Gate: G3 Evaluation  
> Date: 2 Kasım 2026  

---

## 1. Security Verification & Secret Scanning

### 1.1 Secret Scan Audit (`qa-secret-scan.mjs`)
- **Status**: **PASS (0 Findings)**
- **Audit Scope**: Tracked and non-ignored files across the entire workspace (source code, xcconfigs, tests, scripts, markdown docs).
- **Rules Evaluated**: Private keys, service account JSON files, review passwords, GitHub tokens, AWS access keys, literal credentials, and unquoted document passwords.
- **Result**: No credentials or server secrets found in repository sources or iOS client bundle.

### 1.2 Firebase & Cloud Infrastructure Credentials
- `Config/Base.xcconfig` defines client-side public identifiers (`LOCIAR_FIREBASE_API_KEY`, `LOCIAR_FIREBASE_PROJECT_ID`). These are public client project identifiers, as documented by Google Firebase security guidelines.
- Service-role credentials, Apple private keys, and GIPHY API keys reside exclusively in Google Cloud Secret Manager (`functions/src/secrets.ts`).
- `testShippedBundleDoesNotEmbedServiceRoleSecrets` in `StoreReadinessTests` verifies that the app bundle contains zero service role secrets.

### 1.3 Transport Security (ATS)
- App Transport Security (ATS) is enforced. All client network traffic uses TLS 1.3/1.2 over HTTPS.
- In-app Safari sheet loads legal and support pages (`/privacy`, `/terms`, `/support`) exclusively via HTTPS (`https://lociar-admin--lociar-2f38c.us-central1.hosted.app`).
- `testLegalURLLoaderRejectsPlaceholdersAndRequiresHTTPS` in `StoreReadinessTests` verifies that no unencrypted HTTP or placeholder endpoints exist.

---

## 2. Apple App Store Privacy Compliance

### 2.1 Privacy Manifest (`PrivacyInfo.xcprivacy`)
The iOS application includes a comprehensive, valid `PrivacyInfo.xcprivacy` at `LociAR/Resources/PrivacyInfo.xcprivacy`:
- **Tracking**: `NSPrivacyTracking = false`. The app does not track users across foreign apps or websites and contains zero tracking SDKs.
- **Tracking Domains**: Empty (`[]`).
- **Required Reason APIs**:
  1. `NSPrivacyAccessedAPICategoryUserDefaults` (Reason: `CA92.1` — reading/writing local app preferences).
  2. `NSPrivacyAccessedAPICategoryFileTimestamp` (Reason: `C617.1` — managing local SQLite and asset cache freshness).
  3. `NSPrivacyAccessedAPICategorySystemBootTime` (Reason: `35F9.1` — measuring performance intervals and animation frame deltas).
- **Collected Data Types**:
  - `PreciseLocation` & `CoarseLocation`: App Functionality, Analytics (linked to user identity).
  - `UserID` & `DeviceID`: App Functionality (linked to user identity).
  - `EmailAddress` & `Name`: App Functionality (linked to user identity).
  - `PhotosorVideos`: Profile avatar upload only (linked to user identity).
  - `OtherUserContent`: AR posts and location notes (linked to user identity).
  - `ProductInteraction`: In-app navigation and viewing metrics (linked to user identity).
  - `CrashData` & `OtherDiagnosticData`: Crashlytics performance telemetry (unlinked to user identity).
  - `EnvironmentScanning`: ARKit surface plane geometry (linked to user identity).

### 2.2 App Store Review Guideline 5.1.1(v) — Account Deletion
- **Implementation**: Profile -> Settings -> "Hesabı Sil" (Delete Account).
- **Callable**: `deleteAccount` executes a complete hard delete:
  1. Revokes Apple Sign-In authorization token with Apple's servers using the Apple Client Secret.
  2. Recursively deletes all user Firestore documents, comments, likes, and handles.
  3. Recursively purges all user files in Firebase Storage (`avatars/{luid}/`, etc.).
  4. Deletes the Firebase Auth user record.
- **Compliance**: Verified by `functions/test/auth.test.mjs` and `LociARTests/StoreReadinessTests`.

### 2.3 App Store Review Guideline 4.8 — Sign in with Apple
- The app offers Email OTP and Sign in with Apple.
- Sign in with Apple utilizes the native `ASAuthorizationAppleIDButton` styled to Apple HIG standards (minimum 44x44 pt tap target, correct branding).
- Verified by `StoreReadinessTests.testStoreRequiredControlsArePresentInShippedUI`.

---

## 3. Data Protection & Child Safety

- **User Generated Content (UGC) Safety (Guideline 1.2)**:
  - Automated link ban: URLs are rejected by `createPost`.
  - Automated adult content rejection: 18+ filter blocks NSFW/racy text layers.
  - Community reporting: Any user can report a post via `post-report`.
  - Threshold auto-hiding: Content reaching report thresholds is automatically hidden pending admin review.
  - User blocking: Complete two-way block mechanism (`profile-block-user` and `anonymous_blocks`).
- **Export Compliance**: `ITSAppUsesNonExemptEncryption = NO` in `Info.plist`. The app uses standard HTTPS encryption exempt under category 5.1.

---

## 4. Gate G3 Evaluation

- **Criterion**: Zero P0/P1 security vulnerabilities, 100% compliant `PrivacyInfo.xcprivacy`, App Store 5.1.1(v) account deletion verified, and 0 secrets in repo.
- **Decision**: **G3 PASS** (Approved by A07 + A13).
