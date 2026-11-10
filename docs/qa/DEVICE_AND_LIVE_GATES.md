# LociAR Device Readiness & Live Production Gates

**Audit Date:** 2026-11-02  
**Target Platform:** iOS 17.0+ (Swift 6 strict concurrency)  
**Firebase Project:** `lociar-2f38c`  
**Apple Team / Bundle:** `com.lociar.app`

---

## 1. Physical Device & Simulator Matrix

| Target Profile | Architecture | Minimum iOS | Validation Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **iPhone 15 / 16 / 17 / 18 Pro** | `arm64` | iOS 17.0+ | **Simulator & Device Ready** | LiDAR sensor enabled, ARKit World Tracking + ARCore Geospatial supported |
| **iPhone Standard (15/16/17)** | `arm64` | iOS 17.0+ | **Simulator & Device Ready** | Non-LiDAR depth fallback tested; Raycast candidate sampling verified |
| **iPad Pro (M2/M4/M5)** | `arm64` | iPadOS 17.0+ | **Simulator Ready** | Scaled AR view, Split View responsive layout validated |

---

## 2. Production Pre-Deployment Gates

Before triggering live deployment or submitting the `.ipa` archive to TestFlight / App Store Connect, ensure the following gates pass:

### Gate 1: Local Secret & Credential Preflight
```bash
export PATH="/opt/homebrew/bin:$PATH"
bash scripts/qa-secret-scan.sh
```
- Must output: `Secret scan passed (tracked and non-ignored files, including docs and tests)`.

### Gate 2: Localization & Store Metadata Consistency
```bash
python3 scripts/l10n/build_catalog.py --check
node scripts/check-localization.mjs --release
python3 scripts/store-metadata/build.py --check
python3 aso_check.py
```
- All 12 languages must pass key parity, format specifier checks, and App Store character limits (Title <= 30, Subtitle <= 30, Promo Text <= 170).

### Gate 3: Cloud Functions & Admin Production Checks
```bash
(cd functions && npm run typecheck && npm test)
(cd admin && npm test)
node scripts/check-dependency-audit.mjs functions admin
```
- 192/192 functions tests pass.
- 48/48 admin tests pass.
- 0 known dependency security vulnerabilities.

### Gate 4: Review Account Provisioning Check
```bash
# Required before submission for Apple Review team credentials:
node functions/scripts/provision-review-account.mjs \
  --email="review@lociar.app" \
  --output=/path/to/secure/review-credentials.json
```
- Must verify that `handles/apple_review` and `profiles` are reserved atomically.

---

## 3. Physical AR & Location Verification Checklist

1. **AR World Tracking & Surface Raycasting:**
   - [x] Surface estimation with candidate sampling.
   - [x] Fallback to approximate placement when tracking state is limited.
   - [x] Clean pause and teardown of `ARSession` upon background transition.
2. **Background Geofencing & Location Monitoring:**
   - [x] Precise location requested only upon explicit user action.
   - [x] Campaign geofence IDs properly formatted (`prefix(id) + campaignId`).
   - [x] Synchronous `endBackgroundTask` invocation on expiration handlers.
3. **World Map Persistence & Storage Privacy:**
   - [x] Local storage isolation in protected application sandbox.
   - [x] Compressed world maps bounded against zip-bomb style expansion.
   - [x] Owner-scoped read/write rules via `storage.rules`.
