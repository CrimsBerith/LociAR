# LociDrop 1.0 — Data Inventory & Retention Policy

> Phase: P5 (Security, Privacy & Apple Compliance)  
> Owners: A07 (Privacy Specialist), A01 (Product Auditor)  
> Date: 2 Kasım 2026  
> Compliance Framework: Apple App Privacy (Nutrition Labels) & GDPR / KVKK  

---

## 1. Collected Data Elements & Classification

| Data Category | Data Element | Storage Location | Linked to Identity? | Used for Tracking? | Purpose |
|---|---|---|---|---|---|
| **Contact Info** | Email address (Apple relay or direct email) | Firebase Auth / `users_private` | YES | NO | Account authentication, service notifications |
| **Identifiers** | User ID (`luid`), Device Token (`fcm_token`) | Firebase Firestore | YES | NO | Session routing, APNs push delivery |
| **Location** | Precise GPS coordinates (lat/lng, altitude) | Encrypted Firestore | NO (When anonymous) / YES (When attributed) | NO | Placing AR text/GIF notes and discovering nearby content |
| **User Content** | Post text, KLIPY GIF slug and dimensions, comments | Firestore `posts` collection | Optional (Anonymous vs Attributed) | NO | Core social service functionality |
| **Diagnostics** | Crash stack traces, performance logs | Firebase Crashlytics & Performance | NO (Pseudonymous device ID) | NO | Reliability, crash diagnosis, regression prevention |
| **Usage Data** | App launches, screen views | Local device / Minimal Firebase Analytics | NO | NO | Product improvement, thermal budget management |

---

## 2. Data Retention & Deletion Schedule

| Category | Retention Period | Deletion Mechanism |
|---|---|---|
| **Active User Posts** | Permanent until deleted by author or moderation | In-app author delete or account deletion |
| **Deleted Posts** | Soft-deleted (`deleted_at`), purged after 30 days | Nightly maintenance job in Cloud Functions |
| **Account Profile & Credentials** | Immediate upon user request | User-initiated in-app account deletion (Guideline 5.1.1(v)) |
| **Spatial Map Tile Cache** | 1-hour SQLite TTL | Automatic eviction / LRU pruning on next pan |
| **Push Notification Tokens** | Valid until unregistered or replaced | Token refresh listener; stale tokens purged on invalidation |
| **Crash Reports & Logs** | 90 days maximum | Managed by Firebase retention policy |

---

## 3. Data Minimization Controls

1. **Camera Sensor Frames**:
   - Camera video frames are processed exclusively in real-time RAM via ARKit / RealityKit.
   - Raw camera video feeds and photographic snapshots are **never uploaded to any server or disk storage**.
2. **Contact Books / Address Books**:
   - Never requested; zero access entitlements.
3. **Advertising Trackers (IDFA / ATT)**:
   - App does not link user data with third-party data for targeted advertising.
   - App Tracking Transparency (ATT) framework is **not included or invoked**, completely adhering to Apple guidelines.

