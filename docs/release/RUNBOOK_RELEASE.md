# LociDrop 1.0 — Operational Release & Deployment Runbook

> Phase: P9 / P11  
> Owners: A12 (CI/CD Specialist), A00 (Technical Leader)  
> Application: LociDrop iOS & Firebase Backend (`lociar-2f38c`)  
> Target Date: 2 Kasım 2026  

---

## 1. Pre-Deployment Automated Verification

Before creating an archive or deploying backend updates, execute the local preflight verification suite:

```bash
cd LociAR

# 1. Run secret scan across all tracked files
node scripts/qa-secret-scan.mjs

# 2. Check localization catalogs for missing or unreviewed copy
node scripts/check-localization.mjs --release

# 3. Check launch seed data integrity
python3 scripts/seed/world_capitals.py --check
python3 scripts/seed/landmark_businesses.py --check
python3 scripts/seed/turkey_launch.py --check

# 4. Run script regression tests
node --test scripts/test/*.test.mjs

# 5. Run Cloud Functions tests & TypeScript typecheck
(cd functions && npm run typecheck && npm test)

# 6. Run Admin console tests & TypeScript typecheck
(cd admin && npm run typecheck && npm test)

# 7. Run native iOS unit tests on simulator
xcodebuild test -project LociAR.xcodeproj -scheme LociAR \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -only-testing:LociARTests -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO

# 8. Run UI smoke tests
xcodebuild test -project LociAR.xcodeproj -scheme LociAR \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -only-testing:LociARUITests/EnglishSmokeUITests -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
```

---

## 2. Backend Cloud Functions & Rules Deployment

Deployment to Firebase project `lociar-2f38c` is automated via `scripts/app-store-hazirla.command` or individual Firebase CLI commands:

```bash
# 1. Deploy Firestore Security Rules & Indexes
firebase deploy --only firestore:rules,firestore:indexes --project lociar-2f38c

# 2. Deploy Firebase Storage Rules
firebase deploy --only storage --project lociar-2f38c

# 3. Deploy Cloud Functions (in batches of 5, deleting retired functions)
node scripts/firebase-deploy.mjs

# 4. Deploy Next.js Admin Panel to Firebase App Hosting
firebase deploy --only apphosting --project lociar-2f38c
```

---

## 3. Provisioning the App Review Account

```bash
cd functions
# Generate reviewer credentials into a secure local file (not inside repo)
node scripts/provision-review-account.mjs apple-review@alfagolab.com

# Seed sample review content around Apple Park and Istanbul
node scripts/seed-review-content.mjs apple-review@alfagolab.com
```

---

## 4. Release Archive & Code Signing

Execute the archive build on a macOS workstation with the distribution certificate installed in Keychain:

```bash
# 1. Clean build directory
rm -rf build/artifacts && mkdir -p build/artifacts

# 2. Generate Release xcarchive
xcodebuild archive \
  -project LociAR.xcodeproj \
  -scheme LociAR \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ./build/artifacts/LociAR.xcarchive \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=ZSRUTGX74S

# 3. Upload Crashlytics dSYMs for crash symbolication
sh scripts/upload-crashlytics-symbols.sh

# 4. Export IPA and upload to App Store Connect / TestFlight
xcodebuild -exportArchive \
  -archivePath ./build/artifacts/LociAR.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath ./build/artifacts/
```

---

## 5. Rollback & Hotfix Procedure

1. **Client Kill-Switch / Flag Rollback**:
   - If an unexpected UGC abuse vector appears, set `system/flags.kill_switch = true` in Firestore via the Admin panel.
   - This immediately refuses new post creation without requiring an App Store binary release; reporting and account-deletion flows remain available.
2. **Cloud Functions Hotfix**:
   - Apply minimal fix to `functions/src/`.
   - Deploy specific function: `firebase deploy --only functions:<functionName> --project lociar-2f38c`.
3. **App Store Emergency Hotfix**:
   - Increment `CURRENT_PROJECT_VERSION` in `project.yml`.
   - Re-run `xcodegen generate` and archive.
   - Submit for Expedited App Review via App Store Connect Contact Us form citing critical live defect.
