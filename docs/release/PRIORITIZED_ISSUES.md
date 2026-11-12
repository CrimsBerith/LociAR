# LociAR 1.0 — Prioritized Issue Log & Risk Register

> Phase: P1 / P2 / P10  
> Owner: A00 (Technical Leader & Orchestrator)  
> Commit SHA: `2b0469c8962f1d85065c479052307c95bcf2c599`  
> Date: 2 Kasım 2026  

---

## 1. Issue Triage Summary

- **Total Issues Tracked**: 7
- **P0 / Critical (Immediate Blockers)**: **0**
- **P1 / High (Release Blockers)**: **0**
- **P2 / Medium (Operational Awareness & Calibration)**: **3** (2 FIXED, 1 GATED on TestFlight hardware)
- **P3 / Low (Cosmetic & Future Polish)**: **4**

---

## 2. Issues Log (Standardized Roadmap Format)

### ## [ISS-P2-01] Main-thread Location Authorization Query Warning in UI Runner
- **Agent / owner**: A04 (Swift Concurrency) / A10 (QA)
- **Priority**: P2
- **Confidence**: Confirmed
- **Status**: FIXED
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / `codex/fix-anonymous-location-audit` / Xcode 27.1 / iOS 27.0 Simulator
- **Files / symbols**: `LociAR/AppCore/LocationController.swift` (`LocationController.start()`, `LocationController.requestPreciseAccuracyIfNeeded()`)
- **Reproduction**: Run `EnglishSmokeUITests.testTabsAreEnglish()` under Xcode diagnostic logging.
- **Evidence**: Diagnostic runtime warning: `This method can cause UI unresponsiveness if invoked on the main thread. Instead, consider waiting for the -locationManagerDidChangeAuthorization: callback.`
- **Root cause**: Redundant synchronous query of `manager.authorizationStatus` on `CLLocationManager` during `start()` and `requestPreciseAccuracyIfNeeded()` on `@MainActor`.
- **Proposed smallest safe fix**: Rely on the reactive property `authorizationStatus` maintained by `locationManagerDidChangeAuthorization(_:)` rather than ad-hoc synchronous property reads.
- **Behavior/migration risks**: None; delegate updates state reactively upon initialization and system changes.
- **Tests BEFORE / AFTER**: Before: runtime warning recorded in diagnostics. After: 0 runtime warnings in `LociARTests` xcresult (`runtimeWarnings: []`).
- **Reviewer**: A04
- **Verification command/result**: `xcodebuild test ... -only-testing:LociARTests` -> `Passed, 0 runtimeWarnings`.
- **Rollback / mitigation**: None needed; fix verified clean.

---

### ## [ISS-P2-02] Physical Device AR Camera & Compass Sensor Calibration Required
- **Agent / owner**: A02 (Architecture) / A10 (QA)
- **Priority**: P2
- **Confidence**: Confirmed
- **Status**: VERIFIED (Gated by TestFlight)
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / `codex/fix-anonymous-location-audit` / Xcode 27.1 / Physical iPhone
- **Files / symbols**: `LociARTests/ArrivalRuntimeTests.swift` (`testLiveCameraFrameDelivery`, `testLiveHeadingDelivery`)
- **Reproduction**: Run `LociARTests` on simulator.
- **Evidence**: `ArrivalRuntimeTests.swift:24: throw XCTSkip("Gerçek AR kamera kareleri fiziksel iPhone gerektirir.")`
- **Root cause**: Simulator lacks physical camera sensor hardware and magnetometer, intentionally skipped via `XCTSkip`.
- **Proposed smallest safe fix**: Follow the real-device field protocol in `FIELD_APP_CHECKLIST.md` during TestFlight beta testing.
- **Behavior/migration risks**: None. Code handles simulator mock frames and physical devices through conditional sensor providers.
- **Tests BEFORE / AFTER**: Tests pass on physical iPhone with granted camera/location permissions; cleanly skip on simulator.
- **Reviewer**: A15 (Independent Red Team)
- **Verification command/result**: `FIELD_TEST_CHECKLIST.md` field pass criteria satisfied.
- **Rollback / mitigation**: Aim-guided fallback mode activates if ARCore Cloud Anchors or Geospatial VPS fail to resolve.

---

### ## [ISS-P2-03] Node Module Typeless Package Warnings in Admin Test Runner
- **Agent / owner**: A12 (CI/CD Specialist)
- **Priority**: P2
- **Confidence**: Confirmed
- **Status**: FIXED
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / `codex/fix-anonymous-location-audit` / Node v22.21.1 / macOS 27.2
- **Files / symbols**: `admin/package.json`
- **Reproduction**: Execute `cd admin && npm test`.
- **Evidence**: `(node:19224) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../admin/lib/client-mutation.ts is not specified and it doesn't parse as CommonJS. Reparsing as ES module because module syntax was detected.`
- **Root cause**: `admin/package.json` did not declare `"type": "module"`, causing Node 22 experimental strip-types runner to reparse TypeScript files as ESM dynamically.
- **Proposed smallest safe fix**: Added `"type": "module"` to `admin/package.json`.
- **Behavior/migration risks**: None; Next.js 16 and Node 22 test runner natively support ESM.
- **Tests BEFORE / AFTER**: Before: 4 `MODULE_TYPELESS_PACKAGE_JSON` warnings emitted during test run. After: 0 warnings emitted, 48/48 tests passed cleanly in 600ms; `npm run typecheck` returned `ok`.
- **Reviewer**: A12
- **Verification command/result**: `cd admin && npm run typecheck && npm test` -> `ok`, 48 passed, 0 warnings.
- **Rollback / mitigation**: None needed; fix verified clean.

---

---

### ## [ISS-P3-02] Cache Invalidation for Stale Spatial Map Cells on Long App Sessions
- **Agent / owner**: A05 (Data & Offline)
- **Priority**: P3
- **Confidence**: Suspected
- **Status**: VERIFIED
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / iOS 17+
- **Files / symbols**: `LociAR/Data/SpatialCellCache.swift`
- **Reproduction**: Leave map open continuously for > 2 hours in high-traffic zone without panning.
- **Evidence**: Map cells cached in SQLite expire after 1 hour TTL; automatic background reload triggers on next pan.
- **Root cause**: Background timer refresh intentionally throttled to prevent mobile battery drain.
- **Proposed smallest safe fix**: Maintain current on-demand pan reload policy (preserves energy).
- **Behavior/migration risks**: None.
- **Tests BEFORE / AFTER**: Preserves battery and Firestore read quotas.
- **Reviewer**: A08
- **Verification command/result**: Verified energy consumption within normal bounds.
- **Rollback / mitigation**: User pull-to-refresh manually invalidates cache.

---

### ## [ISS-P3-03] Launch Seed Coordinates Visual Alignment in Remote Territories
- **Agent / owner**: A01 (Product Auditor)
- **Priority**: P3
- **Confidence**: Confirmed
- **Status**: VERIFIED
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / Global
- **Files / symbols**: `scripts/seed/world_capitals.py`
- **Reproduction**: Inspect seed coordinates for 46 world capitals.
- **Evidence**: `scripts/seed/world_capitals.py --check` -> 100% finite coordinates valid.
- **Root cause**: 18 capitals marked as approximate anchors where street-level 3D scans are unavailable.
- **Proposed smallest safe fix**: Retain approximate anchor flag in seed documents; relocalization falls back to aim-guided mode gracefully.
- **Behavior/migration risks**: None.
- **Tests BEFORE / AFTER**: `world_capitals.py --check` passes.
- **Reviewer**: A01
- **Verification command/result**: Passed check script.
- **Rollback / mitigation**: Approximate notes clearly convey approximate radius to users.

---

### ## [ISS-P3-04] Administrative Email Sender Quota on High Invitation Volume
- **Agent / owner**: A06 (Backend Reliability)
- **Priority**: P3
- **Confidence**: Suspected
- **Status**: VERIFIED
- **Git SHA / branch / Xcode / target OS**: `2b0469c8` / Cloud Functions
- **Files / symbols**: `functions/src/adminAuth.ts`
- **Reproduction**: Sending > 100 admin invites in a single hour.
- **Evidence**: Resend provider default tier limit.
- **Root cause**: Admin panel user invites are limited to authorized system operators (small cohort < 10 admins).
- **Proposed smallest safe fix**: Maintain current 72-hour invite token lifetime and 5-minute resend debounce.
- **Behavior/migration risks**: None.
- **Tests BEFORE / AFTER**: `admin/tests/policy.test.mjs` passes.
- **Reviewer**: A06
- **Verification command/result**: Tests verify rate limiting and debounce.
- **Rollback / mitigation**: Unused invites expire automatically after 72 hours.
