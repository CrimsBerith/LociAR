# LociAR 1.0 — Initial Technical Baseline & Verification Record

> Phase: P1  
> Owners: A00 (Technical Leader), A12 (CI/CD Specialist), A09 (Test Specialist)  
> Recorded At: 2 Kasım 2026 04:00 TRT  
> Host Environment: macOS 27.2 (Darwin 26B123), Apple Silicon M4 (10 cores, 16 GB RAM)  

---

## 1. Technical Baseline Identifiers

| Parameter | Value | Verification Command / Source |
|---|---|---|
| **Git Commit HEAD** | `2b0469c8962f1d85065c479052307c95bcf2c599` | `git rev-parse HEAD` |
| **Git Active Branch** | `codex/fix-anonymous-location-audit` | `git branch --show-current` |
| **Working Tree Status** | Clean (untracked documentation files only) | `git status --short` |
| **Xcode Version** | Xcode 27.1 (Build 27A9275) | `xcodebuild -version` |
| **Apple Swift Version** | Swift 6.0 (compiler Swift 6.0) | `swiftc -version` |
| **macOS SDK** | macOS 27.2 SDK | `xcrun --show-sdk-version` |
| **iOS Deployment Target** | iOS 17.0 | `project.yml: IPHONEOS_DEPLOYMENT_TARGET` |
| **iOS Build SDK** | iOS 27.1 SDK (`iphonesimulator27.1`) | `xcodebuild -showsdks` |
| **Target Devices** | iPhone (`TARGETED_DEVICE_FAMILY = "1"`) | `project.yml` |
| **Primary Test Simulator** | iPhone 18 Pro (iOS 27.0, UDID `EEC5009F-55FB-45A5-AA2C-5AF5F63D1D69`) | `xcrun simctl list devices` |
| **Node.js Runtime** | Node.js v22.21.1 | `node -v` |
| **Python Runtime** | Python 3.14.0rc3 | `python3 --version` |

---

## 2. Automated Test Baseline Execution Record

### 2.1 Native iOS Unit & Integration Tests (`LociARTests`)
- **Execution Command**:
  ```bash
  xcodebuild test -project LociAR.xcodeproj -scheme LociAR \
    -destination 'platform=iOS Simulator,id=EEC5009F-55FB-45A5-AA2C-5AF5F63D1D69' \
    -only-testing:LociARTests -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
  ```
- **Results**:
  - **Total Tests Executed**: 276
  - **Passed**: 274
  - **Skipped**: 2 (`ArrivalRuntimeTests.testLiveCameraFrameDelivery`, `ArrivalRuntimeTests.testLiveHeadingDelivery` — both skipped intentionally via `XCTSkip` because live physical camera and physical compass sensor streaming require a tethered iPhone).
  - **Failures / Errors**: **0**
  - **Runtime Warnings**: **0** (`runtimeWarnings: []` verified via xcresulttool)
  - **Execution Duration**: 1.62 seconds (total command time 5.75s).
  - **Result Status**: `** TEST SUCCEEDED **`

### 2.2 Native iOS UI Smoke Tests (`LociARUITests`)
- **Execution Command**:
  ```bash
  xcodebuild test -project LociAR.xcodeproj -scheme LociAR \
    -destination 'platform=iOS Simulator,id=EEC5009F-55FB-45A5-AA2C-5AF5F63D1D69' \
    -only-testing:LociARUITests/EnglishSmokeUITests -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
  ```
- **Results**:
  - `EnglishSmokeUITests.testSignedOutScreenIsEnglish`: **PASSED**
  - `EnglishSmokeUITests.testTabsAreEnglish`: **PASSED**
  - **Total Executed**: 2
  - **Passed**: 2
  - **Failed**: 0
  - **Result Status**: `status: succeeded`

### 2.3 Secret Scanner Audit (`qa-secret-scan.mjs`)
- **Execution Command**: `node scripts/qa-secret-scan.mjs`
- **Output**: `Secret scan passed (tracked and non-ignored files, including docs and tests).`
- **Findings Count**: **0**

### 2.4 Localization Completeness & Strings Check
- **Execution Command**: `node scripts/check-localization.mjs --release`
- **Output**: `720 keys; 12 languages; 0 translations marked needs_review.`
- **Result Status**: **PASSED** (100% translated across 12 languages).

### 2.5 Launch Seeds & Geo Consistency
- **Commands**:
  - `python3 scripts/seed/world_capitals.py --check` -> `46 capitals, 322 notes, 46 AR posts` (**PASSED**)
  - `python3 scripts/seed/landmark_businesses.py --check` -> `52 business notes in 33 cities; 38 placed from address` (**PASSED**)
  - `python3 scripts/seed/turkey_launch.py --check` -> `istanbul-beta: 250 notes + 12 AR drafts; turkey-streets: 120 notes + 11 AR drafts` (**PASSED**)

### 2.6 Script Regressions (`scripts/test/*.test.mjs`)
- **Execution Command**: `node --test scripts/test/*.test.mjs`
- **Summary**: `tests 65, pass 65, fail 0, cancelled 0, skipped 0, todo 0`
- **Duration**: 12.82s
- **Result Status**: **PASSED**

### 2.7 Backend Cloud Functions Tests (`functions`)
- **Execution Command**: `cd functions && npm test`
- **Summary**: `tests 192, pass 192, fail 0, cancelled 0, skipped 0, todo 0`
- **Typecheck Command**: `cd functions && npm run typecheck` -> `ok`
- **Result Status**: **PASSED**

### 2.8 Operations Admin Console Tests (`admin`)
- **Execution Command**: `cd admin && npm test`
- **Summary**: `tests 48, pass 48, fail 0, cancelled 0, skipped 0, todo 0` (0 typeless package warnings)
- **Typecheck Command**: `cd admin && npm run typecheck` -> `ok`
- **Result Status**: **PASSED**

### 2.9 Release Configuration Compilation
- **Execution Command**:
  ```bash
  xcodebuild build -project LociAR.xcodeproj -scheme LociAR \
    -configuration Release -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
  ```
- **Result Status**: `** BUILD SUCCEEDED **` (Exit code 0).

---

## 3. Initial Technical Debt & Risk Assessment

1. **Physical iPhone Sensors**: AR camera relocalization and high-precision heading can only be verified on a physical iPhone in the field. Simulators mock camera frames and heading.
2. **Apple Review Account Provisioning**: The live review account (`apple-review@alfagolab.com`) must be provisioned via `scripts/provision-review-account.mjs` before submission.
3. **Creator Support Payments**: Remain intentionally disabled (`releaseBuilds = false`). Verified by `StoreReadinessTests.testNormalBuildsHideCreatorSupportUntilExplicitlyEnabled`.

---

## 4. Gate G1 Evaluation

- **Criterion**: Repo map, feature inventory, build/test baseline, device matrix, and initial risks formally documented with reproducible command evidence.
- **Decision**: **G1 PASS** (Approved by A00 + A01 + A12).
