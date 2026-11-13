# LociDrop 1.0 — Software Bill of Materials (SBOM) & Dependency Audit

> Phase: P1 (Baseline & Debt Mapping)  
> Owners: A12 (CI/CD Specialist), A13 (Compliance Specialist)  
> Date: 2 Kasım 2026  
> Format: SPDX-aligned inventory covering Native iOS, Cloud Functions, and Operations Admin  

---

## 1. Native iOS Dependencies (Swift Package Manager)

All iOS dependencies are resolved via Swift Package Manager (`Package.resolved`):

| Package / Repository | Version / Tag | License | Purpose | Privacy Manifest Bundled |
|---|---|---|---|---|
| **Firebase iOS SDK** (`firebase-ios-sdk`) | `12.19.3` | Apache 2.0 | Auth, Firestore, Storage, Functions, Crashlytics, Messaging, App Check | YES (`PrivacyInfo.xcprivacy`) |
| **ARCore iOS SDK** (`arcore-ios-sdk`) | `1.56.0` | Apache 2.0 | Geospatial VPS, Cloud Anchors, Horizon relocalization | YES (`PrivacyInfo.xcprivacy`) |
| **GoogleDataTransport** | `10.1.1` | Apache 2.0 | Telemetry pipeline transport for Crashlytics/Performance | YES (`PrivacyInfo.xcprivacy`) |
| **GoogleUtilities** | `8.1.3` | Apache 2.0 | Shared environment helpers and logger utilities | YES (`PrivacyInfo.xcprivacy`) |
| **GoogleAppMeasurement** | `12.19.2` | Proprietary Google | App measurement event handling (strictly minimal analytics) | YES (`PrivacyInfo.xcprivacy`) |
| **nanopb** | `2.30910.1` | Zlib | Compact protocol buffer serialization | YES (`PrivacyInfo.xcprivacy`) |
| **abseil-cpp-binary** | `1.2024072200.0` | Apache 2.0 | C++ standard library additions for gRPC | N/A (Binary) |
| **gRPC-binary** | `1.69.1` | Apache 2.0 | Network transport for Firestore real-time streaming | N/A (Binary) |
| **leveldb** | `1.22.5` | BSD 3-Clause | Local client-side Firestore document cache storage | N/A (C++ Static Library) |
| **Promises** | `2.4.1` | Apache 2.0 | Legacy async/await bridging primitives | YES (`PrivacyInfo.xcprivacy`) |
| **GTMSessionFetcher** | `5.3.1` | Apache 2.0 | Google API authenticated HTTP networking | YES (`PrivacyInfo.xcprivacy`) |

---

## 2. Cloud Functions Dependencies (`functions/package.json`)

| Package Name | Version | License | Security / Vulnerability Audit |
|---|---|---|---|
| `firebase-admin` | `^13.6.0` | Apache 2.0 | 0 vulnerabilities (Audit clean) |
| `firebase-functions` | `^6.6.0` | Apache 2.0 | 0 vulnerabilities (Audit clean) |
| `stripe` | `^17.7.0` | MIT | 0 vulnerabilities (Audit clean) |
| `resend` | `^4.1.2` | MIT | 0 vulnerabilities (Audit clean) |
| `typescript` | `^5.8.2` | Apache 2.0 | Dev dependency |

---

## 3. Operations Admin Console Dependencies (`admin/package.json`)

| Package Name | Version | License | Purpose |
|---|---|---|---|
| `next` | `16.4.3` | MIT | React server framework |
| `react` / `react-dom` | `19.3.1` | MIT | UI rendering engine |
| `firebase` | `^12.3.0` | Apache 2.0 | Client SDK for admin auth & firestore |
| `firebase-admin` | `^14.5.0` | Apache 2.0 | Server-side mutations |
| `qrcode` | `^1.5.4` | MIT | MFA authenticator setup QR rendering |
| `server-only` | `^0.0.1` | MIT | Prevents server code leaking to client bundles |

---

## 4. License Compliance Verification

- **Prohibited Licenses**: No GPL, AGPL, SSPL, or copyleft viral code is included in the application bundle or server binaries.
- **Permissive Composition**: 100% of open-source components use Apache-2.0, MIT, BSD-3-Clause, or Zlib licenses.
- **Third-Party Notices**: Bundled third-party license notices are accessible via the app settings.

