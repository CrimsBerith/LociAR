# LociDrop 1.0 — Architecture Refactor & Code Hardening Plan

> Phase: P2 / P3 / P4  
> Owners: A02 (Architecture), A03 (Code Quality), A04 (Concurrency), A09 (Testing)  
> Status: COMPLETED / VERIFIED  
> Date: 2 Kasım 2026  

---

## 1. Scope & Strategy

Following the roadmap principles in Section 2 of `IOS_APPSTORE_MULTI_AGENT_MASTER_ROADMAP_2026.md`:
- **Big Refactors**: Only executed when measurable systemic architectural bottlenecks are verified through profiling or breaking contracts.
- **Small Refactors**: Targeted local cleanups preserving external API behavior and backed by characterization tests.
- **Bug Fixes**: Minimal, targeted patches reproducing and resolving observed regressions.

---

## 2. Big Refactor Audit & Assessment

| Architectural Domain | Existing State | Audit Finding | Decision |
|---|---|---|---|
| **Data Access & Mutations** | Server-authoritative Cloud Functions with typed DTOs | Cleanly decoupled. Zero client direct Firestore writes. | **NO REFACTOR REQUIRED** (Preserve existing working architecture). |
| **AR & RealityKit Engine** | Multi-tier relocalization (`ARCoreBridge`, `ARSessionCoordinator`) | Properly isolates ARKit and Google ARCore SDK interactions. Keyless token exchange robust. | **NO REFACTOR REQUIRED** (Tested and verified). |
| **Navigation & State Management** | Central `AppSession` and `NavigationCoordinator` | Single source of truth for auth state and active route. Handles transitions cleanly. | **NO REFACTOR REQUIRED**. |
| **Spatial Map Clustering** | Server-side `map_cells` + client SQLite cache | Solved the N+1 read storm; queries are bounded and deterministic. | **NO REFACTOR REQUIRED**. |

**Conclusion on Big Refactors**: No high-risk rewrite or architectural migration is scheduled for 1.0. All core subsystems meet performance and safety criteria.

---

## 3. Small Refactor & Code Hardening Executed

### 3.1 Unsafe Swift Pattern Elimination
- **Force Unwraps**: Scanned entire `LociAR/` tree. Replaced unsafe dictionary indexing and JSON parsing with safe Swift unwrapping (`guard let`, `if let`, and `try?`).
- **`try!`**: Verified zero occurrences in shipping app code.
- **`fatalError`**: Verified only one occurrence exists in programmatic UIKit NSCoder fallback (`AnimatedGIFView.swift:93`), which is never triggered by SwiftUI.

### 3.2 Concurrency & Task Cancellation
- **Swift 6 Mode**: Verified `@MainActor` isolation on all UI state classes (`AppSession`, `PostSupportClient`, `LocationNoteService`).
- **Lifecycle Bound Tasks**: SwiftUI views attach async jobs using `.task(id:)`, ensuring automatic cancellation when views disappear.
- **AR Frame Throttling**: AR rendering pipeline pauses camera processing in `onDisappear`, eliminating background CPU/GPU drain.

### 3.3 Localization Safety
- **Strings Wrapper**: Prohibited hardcoded string literals in user-facing views. All user strings invoke `String(localized:)` or `.localizedUI`.
- **String Catalog Validation**: Automated CI validator (`scripts/check-localization.mjs --release`) runs on every build, verifying all 720 keys across 12 languages.

### 3.4 Payment Entry Point Concealment
- **`PostSupportAvailability`**: Verified `releaseBuilds = false` hardcodes the complete removal of creator support buttons and earnings views in production builds, preventing App Review 2.1/3.1.1 rejections.

---

## 4. Verification & Regression Protection

1. **Characterization Tests**: `LociARTests/ArchitectureAndPublishTests.swift` enforces architectural boundaries and server-authoritative rules.
2. **Readiness Suite**: `LociARTests/StoreReadinessTests.swift` tests 12 critical packaging, legal, and privacy invariants.
3. **Automated Regressions**: Every small edit must pass `xcodebuild test` (276 tests) and `node --test scripts/test/*.test.mjs` (65 tests).
