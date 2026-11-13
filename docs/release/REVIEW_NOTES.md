# LociDrop 1.0 — App Store Review Notes & Reviewer Instructions

> Target: Apple App Review Team  
> App Name: LociDrop  
> Bundle Identifier: `com.khankartal.lociar`  
> Version: 1.0.0 (Build 1)  
> Date: 2 Kasım 2026  

---

## 1. Review Account Credentials

- **Review Email**: `apple-review@locidrop.com`
- **One-Time Code / Sign-In Method**: Direct Sign-In configured for App Review.
  - Review credentials can be verified using the dedicated reviewer token generated at release provisioning time (`scripts/provision-review-account.mjs`).
  - For OTP authentication, reviewer codes sent to this address can be viewed or bypassed via the verified review account profile.
- **Pre-Seeded Content**: Sample AR posts and location notes have been provisioned at:
  - Apple Park Visitor Center, Cupertino (`37.3327° N, 122.0054° W`).
  - Sultanahmet & Galata, Istanbul (`41.0082° N, 28.9784° E`).

---

## 2. Core Feature Walkthrough for Reviewers

### 2.1 Discovering AR Posts & Notes
1. Launch the app and sign in with the review account.
2. Grant Location and Camera permissions when prompted.
3. On the **Map** tab, zoom into Cupertino or Istanbul to view the Cam Katman glass heat map and cluster pins.
4. Tapping a pin cluster opens a sheet with community location notes ranked by likes. Note text is visible because the reviewer account is granted review evaluation access.

### 2.2 Placing an AR Post
1. Navigate to the **AR** tab.
2. Point the iPhone camera at a horizontal or vertical textured surface (such as a desk or floor).
3. Move the device slightly so ARKit detects the surface plane.
4. The center reticle will animate into a focused state. Tap the screen to open the creation editor.
5. Enter a test message (e.g., "Welcome App Review team!"), optionally pick a KLIPY GIF from the search sheet, and tap **Publish**.
6. The post will instantly anchor to that physical surface in 3D augmented reality space.

### 2.3 Community Safety & Reporting
1. Open any post or note.
2. Tap the menu (`...`) or flag button (`post-report`).
3. Select a reason (e.g., "Spam", "Inappropriate content").
4. Posts receiving reports are automatically filtered and queued for administrative review.
5. Tapping **Block User** (`profile-block-user`) immediately mutes that author's content for your account.

### 2.4 Account Deletion (Guideline 5.1.1(v))
1. Navigate to the **Profile** tab.
2. Tap **Settings** (gear icon) -> **Hesabı Sil / Delete Account** (`profile-delete-account`).
3. Confirm deletion in the alert.
4. The system securely calls our backend to revoke the Apple authorization token and wipes all associated account data from Firestore and Storage.

---

## 3. Important Notes on App Behavior & Non-Features

1. **Creator Support Payments Are Disabled**:
   - Creator tipping and support features are intentionally **hidden and unavailable** in this version (`releaseBuilds = false`).
   - You will not find any paywall, purchase button, or StoreKit checkout in this release.
   - We will submit in-app purchases under a future release once all provider agreements are active.
2. **External Links Are Blocked**:
   - To maintain safety and prevent spam, users cannot post external URLs (social media, websites, etc.).
3. **No Direct User Photo/Video Uploads in Posts**:
   - AR posts support text and KLIPY GIFs only. User-submitted photos/videos are not allowed for posts (avatars are the only image uploads).
4. **Testing in Non-AR Environments**:
   - If testing on a desk without sufficient surface texture, ARKit may take a few seconds to detect planes. Simply tilt the device slightly across the floor or table surface.

---

## 4. Contact Information

- **Developer Team**: AlfaGo Lab / Khan Kartal
- **Support Email**: `support@locidrop.com`
- **Technical Contact**: `apple-review@locidrop.com`
