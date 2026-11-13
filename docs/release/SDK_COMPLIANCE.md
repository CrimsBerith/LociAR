# LociDrop 1.0 — Third-Party SDK & Apple Requirements Audit

> Phase: P5 / P11  
> Owner: A13 (SDK / Monetization / Compliance Specialist)  
> Date: 2 Kasım 2026  

---

## 1. Third-Party SDK Inventory & Verification

Apple requires that commonly used third-party SDKs include privacy manifests and code signatures. The following table records all external packages linked into the LociDrop application binary:

| Package / Framework | Version | Repository URL | Apple Listed SDK? | Privacy Manifest Included? | Signature Verified? | Purpose / Function |
|---|---|---|---|---|---|---|
| **FirebaseCore** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Application bootstrap & configuration |
| **FirebaseAuth** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Authentication & token management |
| **FirebaseFirestore** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Cloud database synchronization |
| **FirebaseStorage** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Profile avatar storage |
| **FirebaseFunctions** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Server-authoritative callable RPCs |
| **FirebaseAppCheck** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | App Attest device integrity |
| **FirebaseCrashlytics** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | Crash telemetry (dSYM uploaded via script) |
| **FirebaseMessaging** | 12.19.3 | `https://github.com/firebase/firebase-ios-sdk.git` | Yes | Yes (in SPM bundle) | Yes (Google LLC) | APNs token registration & notifications |
| **Google Utilities** | 8.1.3 | Google (transitive) | Yes | Yes | Yes (Google LLC) | System environment & Reachability |
| **nanopb** | 2.30910.1 | Google (transitive) | No (Internal) | N/A | Yes | Protocol buffer serialization |
| **GTMSessionFetcher** | 5.3.1 | Google (transitive) | Yes | Yes | Yes (Google LLC) | Secure HTTPS networking |
| **ARCoreGARSession** | 1.56.0 | `https://github.com/google-ar/arcore-ios-sdk.git` | No | Yes (bundled) | Yes (Google LLC) | AR session coordination |
| **ARCoreGeospatial** | 1.56.0 | `https://github.com/google-ar/arcore-ios-sdk.git` | No | Yes (bundled) | Yes (Google LLC) | VPS geographic visual relocalization |
| **ARCoreCloudAnchors**| 1.56.0 | `https://github.com/google-ar/arcore-ios-sdk.git` | No | Yes (bundled) | Yes (Google LLC) | Cross-device 365d Cloud Anchors |

---

## 2. KLIPY Integration

- **Requests**: Search and media requests originate on the iOS device; no server-side search proxy or media cache is used.
- **App key**: `getGifConfig` supplies `KLIPY_APP_KEY` to signed-in, App Check-verified clients.
- **Content filter**: Search requests use the `low` filter.
- **Attribution**: "Powered by KLIPY" appears on GIF search and selection interfaces.

---

## 3. Monetization & In-App Purchases (StoreKit)

- **Status in v1.0**: **DISABLED / HIDDEN**.
- **Code Enforcement**: `PostSupportAvailability.releaseBuilds = false` in `LociAR/Data/PostSupportClient.swift`.
- **UI Exposure**: The support button on notes and the Earnings screen in Profile are removed from release builds.
- **StoreKit Entitlements**: Not requested in `LociAR.Release.entitlements`.
- **App Review Compliance**: Eliminates any risk of rejection under Guideline 3.1.1 (In-App Purchase) or Guideline 2.1 (Performance / Incomplete Features).

---

## 4. Export & Legal Compliance

- **Encryption**: Standard HTTPS encryption only. `ITSAppUsesNonExemptEncryption` is set to `<false/>` in `LociAR/Resources/Info.plist`.
- **Age Rating**: Social networking and community user-generated content questionnaire answers prepared for 12+ / 17+ (Unrestricted Web Access is NO; Location sharing is YES).
