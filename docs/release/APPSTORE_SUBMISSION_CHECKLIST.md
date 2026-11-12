# LociAR 1.0 — App Store Connect Submission Checklist

> Phase: P11  
> Owners: A14 (App Store / Submission Specialist), A00 (Technical Leader)  
> Target App Store Version: 1.0.0 (Build 1)  
> Bundle Identifier: `com.khankartal.lociar`  
> Date: 2 Kasım 2026  

---

## 1. App Store Connect Metadata Inventory

| Field | Shipped / Prepared Value | Verification Status |
|---|---|---|
| **App Name** | `LociAR` | Matches `CFBundleDisplayName` and `project.yml`. |
| **Subtitle** | Pin notes to real places | HIG character count ≤ 30 characters (24 chars). |
| **Primary Category** | Social Networking (`public.app-category.social-networking`) | Declared in `Info.plist`. |
| **Secondary Category** | Navigation / Travel | Appropriate for location notes. |
| **Primary Language** | English (`en-US`) | Development language. |
| **Localizations** | 12 languages (en, tr, zh-Hans, hi, es, fr, ar, bn, pt, ru, de, ja) | 100% translated in String Catalogs. |
| **Copyright** | `© 2026 LociAR` | Verified. |
| **Support URL** | `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support` | Live HTTPS endpoint, active contact options. |
| **Marketing URL** | `https://lociar-admin--lociar-2f38c.us-central1.hosted.app` | Live HTTPS endpoint. |
| **Privacy Policy URL**| `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy` | Live HTTPS endpoint, complete data practices. |
| **Terms of Service URL**| `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms` | Live HTTPS endpoint, community rules. |

---

## 2. App Store Visual Assets

- [x] **App Icon**: 1024 x 1024 pt, opaque PNG (RGB color profile, zero alpha channel). Verified by `StoreReadinessTests.testAppIconIsOpaque1024PNG`.
- [x] **Screenshots Matrix**: Prepared for 6.9" iPhone display (iPhone 18 Pro Max / 16 Pro Max) and 6.3" display (iPhone 18 Pro / 16 Pro):
  1. AR Camera Surface Placement ("Gerçek dünyaya not bırak").
  2. Cam Katman Glass Heat Map ("Çevrendeki notları keşfet").
  3. Location Note Detail & Interaction ("Mekâna özel ipuçları").
  4. KLIPY AR Chat Bubble ("GIF ve metinle anlat").
  5. Profile & Community Safety ("Güvenli ve şeffaf topluluk").

---

## 3. App Privacy Questionnaire (Nutrition Labels)

The declarations in App Store Connect must strictly mirror `PrivacyInfo.xcprivacy`:

- **Data Used to Track You**: `No, we do not track you`.
- **Data Linked to You**:
  - Location (Precise Location, Coarse Location) -> App Functionality, Analytics.
  - User Content (Other User Content) -> App Functionality.
  - Contact Info (Email Address, Name) -> App Functionality.
  - Identifiers (User ID, Device ID) -> App Functionality.
  - Photos or Videos (Avatar photo upload) -> App Functionality.
  - Usage Data (Product Interaction) -> App Functionality, Analytics.
- **Data Not Linked to You**:
  - Diagnostics (Crash Data, Performance Data) -> App Functionality, Analytics.

---

## 4. Age Rating & Content Declarations

- **Age Rating Category**: Recommended **12+** / **17+** (due to User Generated Content and Location Sharing).
- **Unrestricted Web Access**: `NO` (All external links are blocked).
- **Gambling & Contests**: `NO`.
- **Medical / Treatment Info**: `NO`.
- **Location Sharing**: `YES` (Core feature: notes tied to physical coordinates).

---

## 5. App Review Notes & Demo Account

- **Demo Credentials**:
  - Account: `apple-review@alfagolab.com`
  - Credentials: Generated via `scripts/provision-review-account.mjs` and securely pasted into App Store Connect Review Notes.
  - Demo Seed Content: Pre-populated around Apple Park (Cupertino) and Istanbul landmarks via `scripts/seed-review-content.mjs`.
- **Special Hardware Notes**: Explained that ARKit camera surface detection requires physical camera motion; Map features can be tested using simulated GPS coordinates.
- **Notice on Payments**: Explicitly stated that creator support payments are intentionally disabled in version 1.0 (`PostSupportAvailability.releaseBuilds = false`).

---

## 6. Gate G8 Evaluation

- **Criterion**: All metadata, URLs, privacy responses, and review notes prepared; zero missing store declarations.
- **Decision**: **G8 PASS (TECHNICAL READINESS)** (Approved by A00 + A14).
