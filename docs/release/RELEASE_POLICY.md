# LociDrop 1.0 — Release Policy & Governance

> Phase: P0 (Product, Scope & Risk Governance)  
> Owners: A00 (Technical Leader), A01 (Product Auditor), A14 (App Store Specialist)  
> Date: 2 Kasım 2026  
> Scope: LociDrop iOS Application & Cloud Operations  

---

## 1. Release Classification & Semantic Versioning

LociDrop adheres to strict Semantic Versioning (`MAJOR.MINOR.PATCH`) accompanied by monotonically incrementing integer build numbers:
- **Major (X.0.0)**: Substantial user journey shifts, breaking data schema migrations, or fundamental architectural changes (e.g., v1.0.0 Initial App Store Release).
- **Minor (1.X.0)**: Backwards-compatible feature introductions (e.g., new AR interaction styles, expanded spatial clustering, additional localization languages).
- **Patch (1.0.X)**: Targeted bug fixes, security patches, performance improvements, and App Store compliance adjustments.
- **Build Number**: Monotonically incrementing integer (`CFBundleVersion`) managed via CI/CD for every TestFlight upload.

---

## 2. Platform Support & Device Matrix

| Parameter | Specification | Enforcement Mechanism |
|---|---|---|
| **Operating System** | iOS 17.0 – iOS 27.x | `project.yml: IPHONEOS_DEPLOYMENT_TARGET: "17.0"` |
| **Target Hardware** | iPhone Only (`TARGETED_DEVICE_FAMILY: "1"`) | Project settings; iPad excluded from v1.0 target |
| **Processor Architecture** | Apple Silicon arm64 (A12 Bionic minimum) | Required for ARKit 6 / RealityKit spatial tracking |
| **Sensors Required** | Back-facing Camera, GPS / CoreLocation, Magnetometer | `UIRequiredDeviceCapabilities: [arkit, location-services]` |
| **Network Capability** | Cellular (4G/5G) or Wi-Fi (offline degraded mode supported) | Reachability / NWPathMonitor |

---

## 3. Scope Boundaries & Explicit Non-Goals (v1.0)

1. **Monetization & In-App Purchases**:
   - Creator support payments are **strictly disabled** in release builds (`PostSupportAvailability.releaseBuilds = false`).
   - Digital tips, crypto transfers, and third-party checkout flows are retired and concealed.
2. **Media Uploads**:
   - Photo and video file uploads are retired. Posts consist strictly of UTF-8 text and validated KLIPY GIF slugs (`gifSlug`).
   - External URL hyperlinks within posts are prohibited and scrubbed by Cloud Functions.
3. **Guest Sessions**:
   - Anonymous browsing is allowed, but interactive writes (comments, posts) require verified Apple Sign-In or verified Email identity.

---

## 4. Release Quality Criteria & Gate Mandate

A build candidate may only be submitted to App Store Review if:
1. **Quality Gates G1 through G8** evaluate to `PASS` (or `N/A` where formally proven out of scope).
2. **Defect Severity**: Remaining P0 = 0, Remaining P1 = 0.
3. **Automated Verification**:
   - Native iOS Unit/Integration test suite: 100% pass rate.
   - Script and Backend regression suites: 100% pass rate.
   - Localization completeness: 0 unreviewed keys across all supported locales.
   - Secret scan: 0 leaked credentials across repository files.
4. **Physical Verification**: Real-world camera anchor stability and GPS accuracy field-tested on tethered iPhone hardware via TestFlight internal ring before public rollout.

---

## 5. Emergency Rollback & Mitigation Procedures

1. **Server-Authoritative Kill-Switch**:
   - `system/flags.kill_switch`: Refuses kill-switch-protected admission calls without requiring an App Store update.
   - The server reads this flag; clients cannot override it. Reports, blocks, reads and account deletion remain available.
2. **Phased Release Halt**:
   - Version 1.0.0 will utilize Apple Phased Release (7-day rollout: 1%, 2%, 5%, 10%, 20%, 50%, 100%).
   - At any time during rollout, the release can be paused for up to 30 days in App Store Connect.
3. **Hotfix Protocol**:
   - Critical regression hotfixes branch from the release tag, apply minimal surgical diff, execute full automated regression, and submit for expedited review.
