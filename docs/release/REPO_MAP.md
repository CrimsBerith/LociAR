# LociAR Repository Map & Architecture Blueprint

> Phase: P1  
> Owner: A00 (Technical Leader), A02 (Architecture Specialist)  
> Workspace Root: `/Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR`  
> Git Commit: `2b0469c8962f1d85065c479052307c95bcf2c599`  
> Branch: `codex/fix-anonymous-location-audit`  
> Toolchain: Xcode 27.1 / Swift 6.0 / Node 22 / Python 3.14  
> Date: 2 Kasım 2026  

---

## 1. High-Level Workspace Architecture

The LociAR repository is a mono-repo hosting the native iOS mobile application, the Firebase backend serverless Cloud Functions, the operational administrative console (Next.js), and operational automation scripts.

```text
loci/LociAR/
├── LociAR.xcodeproj/         # Xcode Project (Generated via project.yml / XcodeGen)
├── project.yml               # XcodeGen source specification
├── Config/                   # Xcode build configurations (Base.xcconfig, Local.xcconfig)
├── LociAR/                   # Native iOS Application Sources (Swift 6.0, SwiftUI)
│   ├── Application/          # App entry point, AppDelegate, lifecycle, dependency injection
│   ├── AppCore/              # AppSession, navigation routing, global state coordinator
│   ├── ARCore/               # Google ARCore bridge, Geospatial VPS, Cloud Anchors lifecycle
│   ├── Data/                 # Network clients, Firebase/Firestore adaptors, Keychain, SQLite cache
│   ├── Domain/               # Entities (Post, LocationNote, UserProfile), policies, geometry
│   ├── DesignSystem/         # Theme tokens, Glass effects, Reticles, AnimatedGIFView, Buttons
│   ├── Features/             # UI Features: Auth, AR, Map, Discover, Create, Social, Settings
│   └── Resources/            # Assets, Strings, Entitlements, Info.plist, PrivacyInfo.xcprivacy
├── LociARTests/              # Unit & Integration Tests (276 tests across 12 suites)
├── LociARUITests/            # XCUIAutomation UI & Smoke Tests (English, Auth, Flow)
├── functions/                # Firebase Cloud Functions (TypeScript / Node 22, us-central1)
│   ├── src/                  # Server authoritative endpoints (auth, posts, mapCells, maintenance)
│   └── test/                 # Node test runner integration suites (192 tests)
├── admin/                    # Next.js Admin Panel (Hosted on Firebase App Hosting)
│   ├── app/                  # React server components, moderation, maintenance dashboards
│   └── tests/                # Admin unit & policy tests (48 tests)
├── scripts/                  # Operational, QA, verification & deployment automation scripts
│   ├── ci-ios.sh             # Native CI test runner script
│   ├── check-localization.mjs# Localization completeness validator
│   ├── qa-secret-scan.mjs    # Repository secret and credential scanner
│   ├── release-preflight.mjs # Preflight pipeline verification orchestrator
│   └── seed/                 # Launch content generator scripts
└── docs/                     # Engineering, architecture, safety, and release documentation
    └── release/              # 20 operational delivery master release documents
```

---

## 2. iOS Project Specifications (`project.yml`)

- **Target `LociAR`**:
  - Type: Application (`platform: iOS`)
  - Bundle Identifier: `com.khankartal.lociar`
  - Deployment Target: `iOS 17.0`
  - Swift Version: `6.0` (with Strict Concurrency checks)
  - Targeted Device Family: `1` (iPhone only)
  - Entitlements:
    - Debug: `LociAR/Resources/LociAR.entitlements` (aps-environment: `development`)
    - Release: `LociAR/Resources/LociAR.Release.entitlements` (aps-environment: `production`)
- **Target `LociARTests`**:
  - Type: Bundle Unit-Test (`LociARTests`)
  - Dependency: `LociAR`
- **Target `LociARUITests`**:
  - Type: Bundle UI-Testing (`LociARUITests`)
  - Dependency: `LociAR`

---

## 3. Dependency Inventory & Package Graph

### 3.1 Swift Package Manager (SPM) Dependencies

| Package | Source Repository | Version Pin | Products Used | Purpose |
|---|---|---|---|---|
| **Firebase** | `https://github.com/firebase/firebase-ios-sdk.git` | `12.19.3` | `FirebaseCore`, `FirebaseAuth`, `FirebaseFirestore`, `FirebaseStorage`, `FirebaseFunctions`, `FirebaseAppCheck`, `FirebaseCrashlytics`, `FirebaseMessaging` | Authentication, database, cloud storage, callables, telemetry, push notifications |
| **ARCore** | `https://github.com/google-ar/arcore-ios-sdk.git` | `1.56.0` | `ARCoreGARSession`, `ARCoreGeospatial`, `ARCoreCloudAnchors` | Cloud Anchors (365d), VPS Geospatial relocalization |
| **Google Utilities** | Google (transitive) | `8.1.3` | `GoogleUtilities`, `nanopb`, `Promises` | System support |
| **GTMSessionFetcher** | Google (transitive) | `5.3.1` | `GTMSessionFetcher` | Network transport |
| **gRPC** | Google (transitive) | `1.69.1` | `gRPC-binary` | Firestore network transport |

### 3.2 System Frameworks
- `ARKit.framework`: AR World tracking, plane detection, frame raycasting.
- `RealityKit.framework`: 3D rendering and anchor entity positioning.
- `MapKit.framework`: Native Apple Map integration, annotation display.
- `AuthenticationServices.framework`: Native Sign in with Apple UI button and delegate.
- `libsqlite3.tbd`: Local caching and spatial cell store.

---

## 4. Architectural Boundaries & Data Flow

```text
[ iOS Mobile Client (SwiftUI / RealityKit) ]
       │
       ▼ (HTTPS Callables / App Check Attestation)
[ Firebase Cloud Functions (us-central1) ]
       │
       ├─► [ Cloud Firestore (nam5) ] (Default-Deny Security Rules)
       ├─► [ Firebase Storage ]       (Strict Prefix Rules: avatars, media)
       ├─► [ Google Secret Manager ]   (KLIPY_APP_KEY, Apple Keys)
       ├─► [ Firebase Auth ]          (Custom Claims: luid)
       └─► [ Google ARCore API ]      (Keyless Anchor Management)
```

1. **Client Read Model**: Read-only access to Firestore public collections (`map_cells`, `posts`, `location_notes`) governed by strict `firestore.rules` where remote sensitive text is redacted until on-site location is attested.
2. **Client Write Model**: Strictly server-authoritative. The client **never** executes direct writes to `posts`, counters, user profiles, or moderation records. Every write is mediated by Cloud Functions (`createPost`, `ensureProfile`, `placeNote`, `recordPostView`, `likeNote`, `reportPost`, `deleteAccount`).
3. **Admin Console Model**: Next.js console authenticated with short-lived session cookies, static RBAC, and AAL2 step-up verification for personal/location data access. Deployed via Firebase App Hosting.
