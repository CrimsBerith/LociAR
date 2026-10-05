import Foundation
import XCTest
@testable import LociAR

final class StoreReadinessTests: XCTestCase {
    func testShippedInfoPlistDeclaresStorePackagingRequirements() throws {
        let bundle = appBundle
        // Usage descriptions are localized (InfoPlist.xcstrings); every language names the app and
        // Google ARCore, which processes the camera / location data (ARCore disclosure).
        for key in ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"] {
            let text = try XCTUnwrap(bundle.object(forInfoDictionaryKey: key) as? String, key)
            XCTAssertTrue(text.contains("LociAR") && text.contains("Google ARCore"), "\(key): \(text)")
        }
        let temporary = try XCTUnwrap(
            bundle.object(forInfoDictionaryKey: "NSLocationTemporaryUsageDescriptionDictionary") as? [String: String]
        )
        XCTAssertNotNil(temporary["GeospatialAccuracy"], "purpose key used by LocationController")
        XCTAssertNil(
            bundle.object(forInfoDictionaryKey: "NSPhotoLibraryUsageDescription"),
            "Photo library access was removed; Info.plist must not declare NSPhotoLibraryUsageDescription"
        )
        XCTAssertEqual(bundle.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)
        XCTAssertEqual(
            bundle.object(forInfoDictionaryKey: "UISupportedInterfaceOrientations") as? [String],
            ["UIInterfaceOrientationPortrait"]
        )
        XCTAssertNil(bundle.object(forInfoDictionaryKey: "UISupportedInterfaceOrientations~ipad"))
        XCTAssertEqual(bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String, "LociAR")
        XCTAssertEqual(
            bundle.object(forInfoDictionaryKey: "LSApplicationCategoryType") as? String,
            "public.app-category.social-networking"
        )
        XCTAssertEqual(bundle.object(forInfoDictionaryKey: "LOCIAR_APPLE_AUTH_ENABLED") as? Bool, true)
        let family = bundle.object(forInfoDictionaryKey: "UIDeviceFamily")
        let familyValues = (family as? [Int]) ?? (family as? [NSNumber])?.map(\.intValue)
        XCTAssertEqual(familyValues, [1], "iPhone-only; iPad family must not be included")
    }

    func testShippedPrivacyManifestDeclaresRequiredCollectedDataAndAccessedAPIs() throws {
        let url = try XCTUnwrap(appBundle.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let data = try Data(contentsOf: url)
        let manifest = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        let accessed = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        let accessedTypes = Set(accessed.compactMap { $0["NSPrivacyAccessedAPIType"] as? String })
        XCTAssertTrue(accessedTypes.contains("NSPrivacyAccessedAPICategoryUserDefaults"))
        XCTAssertTrue(accessedTypes.contains("NSPrivacyAccessedAPICategoryFileTimestamp"))
        let collected = try XCTUnwrap(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let collectedTypes = Set(collected.compactMap { $0["NSPrivacyCollectedDataType"] as? String })
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypePreciseLocation"))
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeUserID"))
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypePhotosorVideos"))
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeOtherUserContent"))
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeName"), "Apple full name is sent to ensureProfile")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeProductInteraction"), "views/likes and analytics_events")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeCoarseLocation"), "analytics_events keep approximate location")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeOtherDataTypes"), "camera-derived features sent to Google ARCore")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeCrashData"), "Firebase Crashlytics")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeOtherDiagnosticData"), "Firebase Crashlytics diagnostics")
        XCTAssertTrue(collectedTypes.contains("NSPrivacyCollectedDataTypeDeviceID"), "FCM registration token stored per account")
        XCTAssertTrue(collected.allSatisfy { ($0["NSPrivacyCollectedDataTypeTracking"] as? Bool) == false }, "nothing is used for tracking")
    }

    func testShippedBundleDoesNotEmbedServiceRoleSecrets() throws {
        let info = try XCTUnwrap(appBundle.infoDictionary)
        let serialized = String(describing: info)
        XCTAssertFalse(serialized.contains("service_role"))
        XCTAssertFalse(serialized.contains("private_key"))
        XCTAssertFalse(serialized.contains("BEGIN PRIVATE KEY"))
        let key = info["LOCIAR_FIREBASE_API_KEY"] as? String ?? ""
        XCTAssertFalse(key.contains("private_key"))
    }

    func testFirebaseClientKeyValidationRejectsServerCredentials() {
        XCTAssertTrue(AppConfiguration.isSafeFirebaseClientKey("AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey(nil))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey("AIzaYOUR-API-KEY"))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey("$(LOCIAR_FIREBASE_API_KEY)"))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey("-----BEGIN PRIVATE KEY-----abcdefghijklmnopqrstuvwxyz"))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey("{\"type\":\"service_account\",\"private_key\":\"x\"}"))
        XCTAssertFalse(AppConfiguration.isSafeFirebaseClientKey("a-long-but-unclassified-client-key-value"))
    }

    func testFirebaseIdentityMatchesCloudFunctionLUIDContract() {
        // Vectors generated with functions/src/core.ts luidForUid (uuid v5, fixed namespace).
        XCTAssertEqual(FirebaseIdentity.luid(forFirebaseUID: "abc123").uuidString.lowercased(), "be1c55ae-1a33-5c2c-a038-7d17ecb0ba3a")
        XCTAssertEqual(
            FirebaseIdentity.luid(forFirebaseUID: "Xk9sQv2LmN8pR4tYz1WcB7dE3fG0").uuidString.lowercased(),
            "376f790c-3a38-5f01-8078-c5ead80a1a98"
        )
    }

    func testGeohashMatchesCloudFunctionImplementation() {
        XCTAssertEqual(Geohash.encode(latitude: 57.64911, longitude: 10.40744, precision: 11), "u4pruydqqvj")
        XCTAssertEqual(Geohash.encode(latitude: 41.0082, longitude: 28.9784, precision: 7), "sxk973m")
        XCTAssertEqual(Geohash.encode(latitude: 37.3349, longitude: -122.009, precision: 6), "9q9hrs")
        XCTAssertEqual(
            Geohash.coverPrefixes(latitude: 41.0082, longitude: 28.9784, radiusMeters: 120),
            ["sxk970", "sxk971", "sxk972", "sxk973", "sxk974", "sxk976", "sxk978", "sxk979", "sxk97d"]
        )
        XCTAssertEqual(
            Geohash.coverPrefixes(latitude: 41.0082, longitude: 28.9784, radiusMeters: 50_000),
            ["sx5", "sx7", "sxe", "sxh", "sxj", "sxk", "sxm", "sxs", "sxt"]
        )
        XCTAssertTrue(Geohash.coverPrefixes(latitude: 41, longitude: 29, radiusMeters: 8_000_000).isEmpty)
    }

    func testLegalURLLoaderRejectsPlaceholdersAndRequiresHTTPS() {
        XCTAssertNil(AppConfiguration.publicHTTPSURL(nil))
        XCTAssertNil(AppConfiguration.publicHTTPSURL(""))
        XCTAssertNil(AppConfiguration.publicHTTPSURL("$(LOCIAR_PRIVACY_URL)"))
        XCTAssertNil(AppConfiguration.publicHTTPSURL("https://YOUR-DOMAIN.example/privacy"))
        XCTAssertNil(AppConfiguration.publicHTTPSURL("https://example.com/lociar/privacy"))
        XCTAssertNil(AppConfiguration.publicHTTPSURL("https://www.example.org/terms"))
        XCTAssertNil(AppConfiguration.publicHTTPSURL("http://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy"))
        XCTAssertEqual(
            AppConfiguration.publicHTTPSURL("https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy")?.absoluteString,
            "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy"
        )
        XCTAssertEqual(
            AppConfiguration.publicHTTPSURL("https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms")?.absoluteString,
            "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms"
        )
        XCTAssertEqual(
            AppConfiguration.publicHTTPSURL("https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support")?.absoluteString,
            "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support"
        )
    }

    func testShippedConfigurationExposesConfiguredLegalHTTPSURLs() throws {
        let configuration = AppConfiguration.load(bundle: appBundle)
        XCTAssertEqual(configuration.privacyPolicyURL?.absoluteString, "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy")
        XCTAssertEqual(configuration.termsURL?.absoluteString, "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms")
        XCTAssertEqual(configuration.supportURL?.absoluteString, "https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support")
        XCTAssertTrue(configuration.appleAuthEnabled)
        for url in [configuration.privacyPolicyURL, configuration.termsURL, configuration.supportURL] {
            let value = try XCTUnwrap(url?.absoluteString)
            XCTAssertFalse(value.contains("example.com"))
            XCTAssertFalse(value.contains("YOUR-"))
            XCTAssertTrue(value.hasPrefix("https://"))
        }
    }

    func testStoreRequiredControlsArePresentInShippedUI() throws {
        guard let root = sourceCheckoutRootIfPresent() else {
            throw XCTSkip("UI kaynak denetimi Mac checkout gerektirir.")
        }
        let profile = try String(contentsOf: root.appendingPathComponent("LociAR/Features/Social/SocialViews.swift"), encoding: .utf8)
        let auth = try String(contentsOf: root.appendingPathComponent("LociAR/Features/Auth/AuthView.swift"), encoding: .utf8)
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"profile-privacy\")"))
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"profile-terms\")"))
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"profile-support\")"))
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"profile-delete-account\")"))
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"post-report\")"))
        XCTAssertTrue(profile.contains("accessibilityIdentifier(\"profile-block-user\")"))
        XCTAssertTrue(auth.contains("accessibilityIdentifier(\"auth-apple\")"))
        XCTAssertTrue(auth.contains("SignInWithAppleButton"))
        XCTAssertTrue(auth.contains("accessibilityIdentifier(\"auth-privacy\")"))
        XCTAssertTrue(auth.contains(".frame(minWidth: 44, minHeight: 44)"))
    }

    func testAppIconIsOpaque1024PNG() throws {
        guard let root = sourceCheckoutRootIfPresent() else {
            throw XCTSkip("App Store 1024 ikon denetimi Mac checkout gerektirir.")
        }
        let icon = root.appendingPathComponent("LociAR/Resources/Assets.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png")
        let data = try Data(contentsOf: icon)
        XCTAssertGreaterThan(data.count, 8)
        XCTAssertEqual(Array(data.prefix(8)), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        let width = UInt32(bigEndian: data.subdata(in: 16..<20).withUnsafeBytes { $0.load(as: UInt32.self) })
        let height = UInt32(bigEndian: data.subdata(in: 20..<24).withUnsafeBytes { $0.load(as: UInt32.self) })
        let colorType = data[25]
        XCTAssertEqual(width, 1024)
        XCTAssertEqual(height, 1024)
        XCTAssertEqual(colorType, 2, "App Store 1024 ikonu RGB olmalı, alfa kanalı olmamalı")
    }

    private var appBundle: Bundle { Bundle(for: AppSession.self) }

    private func sourceCheckoutRootIfPresent() -> URL? {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("LociAR.xcodeproj").path) else {
            return nil
        }
        return root
    }
}
