# LociAR 1.0 — Privacy Compliance & Manifest Audit

> Phase: P5 (Security, Privacy & Compliance)  
> Owners: A07 (Privacy Specialist), A13 (Compliance Specialist)  
> Date: 2 Kasım 2026  
> Compliance Standard: Apple WWDC23/WWDC24 Privacy Manifest Requirements  

---

## 1. Privacy Manifest (`PrivacyInfo.xcprivacy`) Audit

The application target includes a verified `PrivacyInfo.xcprivacy` declaring all accessed APIs and collected data types in strict accordance with Apple's required reason categories:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Location (Precise Location) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePreciseLocation</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- User ID -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeUserID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Crash Data & Performance Diagnostics -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeCrashData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <!-- User Defaults (App preferences & session markers) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <!-- File Timestamp (SQLite database & cache file validation) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
        <!-- System Boot Time (High-resolution AR rendering clock calculation) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

---

## 2. Third-Party SDK Privacy Manifests

Both binary and source packages included in LociAR have been validated to contain official Apple privacy manifests:
1. **Firebase iOS SDK (12.19.3)**: Bundles dedicated `PrivacyInfo.xcprivacy` files for FirebaseCore, FirebaseAuth, FirebaseFirestore, FirebaseStorage, FirebaseCrashlytics, and FirebaseMessaging.
2. **Google ARCore SDK (1.56.0)**: Bundles verified `PrivacyInfo.xcprivacy` covering geospatial camera frame processing and cloud anchor resolution.

---

## 3. App Tracking Transparency (ATT) Verification

- **Code Inspection**: Grep search across all source files for `AppTrackingTransparency` and `requestTrackingAuthorization`: **0 occurrences**.
- **No Third-Party Ad Networks**: The application contains no AdMob, Unity Ads, AppLovin, Meta Audience Network, or other advertising SDKs.
- **Result**: No ATT prompt is presented to the user, satisfying Apple App Store Review Guideline 5.1.2.

