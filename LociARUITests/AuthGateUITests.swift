import ObjectiveC.runtime
import UIKit
import XCTest

extension XCUIApplication {
    @objc dynamic func loci_launch() {
        if !launchArguments.contains("-AppleLanguages") {
            launchArguments += ["-AppleLanguages", "(tr)", "-AppleLocale", "tr_TR"]
        }
        loci_launch()
    }

    static let swizzleLaunchOnce: Void = {
        guard let original = class_getInstanceMethod(XCUIApplication.self, #selector(launch)),
              let swizzled = class_getInstanceMethod(XCUIApplication.self, #selector(loci_launch)) else { return }
        method_exchangeImplementations(original, swizzled)
    }()
}

@MainActor
final class AuthGateUITests: XCTestCase {
    override class func setUp() {
        super.setUp()
        _ = XCUIApplication.swizzleLaunchOnce
    }

    func testAuthGateEnglishLocalization() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_SIGNED_OUT", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let signIn = app.buttons["auth-mode-signin"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 8))
        XCTAssertEqual(signIn.label, "Sign in")
        XCTAssertEqual(app.buttons["auth-mode-signup"].label, "Sign up")
        XCTAssertFalse(app.staticTexts["İşlem tamamlanamadı"].exists)
        capture(app, name: "auth-english-localization")
    }

    func testAuthGateArabicLocalizationAndRTL() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_SIGNED_OUT", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        let signIn = app.buttons["auth-mode-signin"]
        let signUp = app.buttons["auth-mode-signup"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 8))
        XCTAssertEqual(signIn.label, "تسجيل الدخول")
        XCTAssertTrue(signUp.exists)
        XCTAssertGreaterThan(signIn.frame.midX, signUp.frame.midX, "Arabic mode tabs should follow right-to-left layout")
        capture(app, name: "auth-arabic-rtl-localization")
    }

    func testAuthGatePassesAutomatedAccessibilityAudit() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_SIGNED_OUT")
        app.launch()
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 5))
        // iOS 26.5 reports false contrast failures for SwiftUI AccessibilityNode
        // even for pure white text on the opaque dark palette. Contrast ratios are
        // verified deterministically in ArchitectureAndPublishTests instead.
        try app.performAccessibilityAudit(for: [
            .dynamicType, .elementDetection, .hitRegion,
            .sufficientElementDescription, .textClipped, .trait
        ])
    }

    func testProfileSupportsAccessibilityXXXL() {
        let app = XCUIApplication()
        app.launchArguments += [
            "UITEST_AUTHENTICATED",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge"
        ]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.staticTexts["Kaydedilenler"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Gizlilik ve güvenlik"].exists)
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Hesap silme işlemi geri alınamaz."].waitForExistence(timeout: 3))
    }

    func testAuthenticatedProfilePassesAutomatedAccessibilityAudit() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        try app.performAccessibilityAudit(for: [
            .elementDetection, .hitRegion, .sufficientElementDescription, .trait
        ])
    }

    func testSignedOutCannotReachTabs() {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_SIGNED_OUT")
        app.launch()
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["auth-password-field"].exists)
        XCTAssertTrue(app.buttons["auth-email-submit"].exists)
        XCTAssertTrue(app.buttons["auth-apple"].exists)
        XCTAssertTrue(identifiedControl(app, "auth-privacy").waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "auth-terms").exists)
        XCTAssertTrue(identifiedControl(app, "auth-terms-consent").exists)
        XCTAssertTrue(identifiedControl(app, "auth-support").exists)
        XCTAssertFalse(app.buttons["auth-google"].exists)
        XCTAssertFalse(app.buttons["auth-device-preview"].exists)

        app.buttons["auth-mode-signup"].tap()
        XCTAssertTrue(app.secureTextFields["auth-confirm-password-field"].waitForExistence(timeout: 3))
        app.buttons["auth-mode-signin"].tap()
        XCTAssertTrue(app.buttons["auth-forgot-password"].waitForExistence(timeout: 3))
        app.buttons["auth-forgot-password"].tap()
        XCTAssertTrue(app.navigationBars["Şifremi unuttum"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["auth-reset-email"].exists)
        app.buttons["Kapat"].tap()
        capture(app, name: "00-auth")
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }

    func testAuthenticatedShellHasFiveTabs() {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))
        XCTAssertTrue(tabs.buttons["AR"].exists)
        XCTAssertTrue(tabs.buttons["Harita"].exists)
        XCTAssertTrue(tabs.buttons["Paylaş"].exists)
        XCTAssertTrue(tabs.buttons["Keşfet"].exists)
        XCTAssertTrue(tabs.buttons["Profil"].exists)
        XCTAssertFalse(tabs.buttons["Aktivite"].exists)
    }

    func testMapTabLoadsNearbyPosts() {
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))
        tabs.buttons["Harita"].tap()
        XCTAssertTrue(app.staticTexts["Yakındaki postlar"].waitForExistence(timeout: 10))
        let row = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "map-open-"))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "Harita yakındaki postları yüklemedi")
        XCTAssertFalse(app.staticTexts["Yakın çevre taranıyor"].exists)
    }

    func testFiveTabNavigationAndLogoutReturnsToAuthGate() {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))

        tabs.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 3))
        tabs.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 8))
        tabs.buttons["Profil"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "profile-privacy").waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "profile-terms").exists)
        XCTAssertTrue(identifiedControl(app, "profile-support").exists)
        scrollUntilHittable(app.buttons["profile-sign-out"], in: app)
        XCTAssertTrue(app.buttons["profile-sign-out"].isHittable)
        XCTAssertTrue(app.buttons["profile-delete-account"].exists)
        app.buttons["profile-sign-out"].tap()
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }

    func testStoreRequiredSafetyControlsAreReachable() {
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))
        XCTAssertTrue(tabs.buttons["AR"].exists)
        XCTAssertTrue(tabs.buttons["Harita"].exists)
        XCTAssertTrue(tabs.buttons["Paylaş"].exists)
        XCTAssertTrue(tabs.buttons["Keşfet"].exists)
        XCTAssertTrue(tabs.buttons["Profil"].exists)

        tabs.buttons["Profil"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "profile-privacy").waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "profile-terms").exists)
        XCTAssertTrue(identifiedControl(app, "profile-support").exists)
        scrollUntilHittable(app.buttons["profile-delete-account"], in: app)
        XCTAssertTrue(app.buttons["profile-delete-account"].isHittable)

        tabs.buttons["Keşfet"].tap()
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].waitForExistence(timeout: 5))
        app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].tap()
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["post-report"].waitForExistence(timeout: 3))
        app.buttons["post-open-profile"].tap()
        XCTAssertTrue(app.buttons["profile-block-user"].waitForExistence(timeout: 3))
    }

    func testAllPrimaryAndProfileRoutesOpen() {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))
        capture(app, name: "01-map")

        tabs.buttons["AR"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 5))
        capture(app, name: "02-ar")

        tabs.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 3))
        capture(app, name: "03-discover")

        tabs.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 8))
        capture(app, name: "04-create")

        tabs.buttons["Profil"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        capture(app, name: "05-profile")

        for route in ["Postlarım", "Aktivite", "Koleksiyonlar", "Kaydedilenler", "Engellenen hesaplar"] {
            app.staticTexts[route].tap()
            XCTAssertTrue(app.navigationBars[route == "Engellenen hesaplar" ? "Engellenenler" : route].waitForExistence(timeout: 3))
            capture(app, name: "route-\(route)")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        }
    }

    func testCreateFlowOpensAndCloses() {
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 5))
        app.buttons["map-create"].tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 5))
        capture(app, name: "create-surface")
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.navigationBars["Harita"].waitForExistence(timeout: 3))
    }

    func testCameraPermissionDenialOffersSettingsRecovery() throws {
#if targetEnvironment(simulator)
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_CAMERA_DENIED"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["Kamera ayarlarını aç"].waitForExistence(timeout: 8))
#else
        throw XCTSkip("İzin sıfırlama testi simulator üzerinde çalışır.")
#endif
    }

    func testLocationPermissionDenialOffersSettingsRecovery() throws {
#if targetEnvironment(simulator)
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_LOCATION_DENIED"]
        app.launch()
        XCTAssertTrue(app.buttons["Ayarlar"].waitForExistence(timeout: 8))
#else
        throw XCTSkip("İzin sıfırlama testi simulator üzerinde çalışır.")
#endif
    }

    func testPostDetailPublicProfileAndEditorPreview() {
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
        app.launch()
        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].waitForExistence(timeout: 5))
        app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].tap()
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 3))
        capture(app, name: "06-post-detail")
        app.buttons["post-open-profile"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        capture(app, name: "07-public-profile")

        app.terminate()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"
        app.launch()
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["create-caption"].exists)
        XCTAssertTrue(app.buttons["create-external-media-picker"].exists)
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["external-platform-spotify"].exists)
        XCTAssertTrue(app.buttons["external-platform-youtube"].exists)
        XCTAssertTrue(app.buttons["external-platform-facebook"].exists)
        XCTAssertTrue(app.buttons["external-platform-instagram"].exists)
        XCTAssertTrue(app.buttons["external-platform-x"].exists)
        capture(app, name: "official-social-platform-logos")
        app.buttons["external-platform-spotify"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["external-import-instruction"].waitForExistence(timeout: 3))
        app.buttons["external-import-complete"].tap()
        XCTAssertTrue(app.textFields["create-external-media"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.textFields["create-external-media"].value as? String, "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU")
        XCTAssertTrue(app.descendants(matching: .any)["external-media-selection-preview"].exists)
        XCTAssertTrue(app.staticTexts["Spotify paylaşımı hazır"].exists)
        XCTAssertFalse(app.staticTexts["Açıklama"].exists)
        XCTAssertFalse(app.staticTexts["Çizim ekle"].exists)
        XCTAssertFalse(app.staticTexts["Bağlantı ekle"].exists)
        capture(app, name: "08-create-editor")
    }

    func testSpotifySelectionReturnsToEditor() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"
        app.launch()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 3))

        app.buttons["external-platform-spotify"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["external-import-instruction"].waitForExistence(timeout: 3))
        app.buttons["external-import-complete"].tap()

        let linkField = app.textFields["create-external-media"]
        XCTAssertTrue(linkField.waitForExistence(timeout: 3))
        XCTAssertEqual(linkField.value as? String, "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU")
        XCTAssertTrue(app.descendants(matching: .any)["external-media-selection-preview"].exists)
        XCTAssertTrue(app.staticTexts["Spotify paylaşımı hazır"].exists)
        capture(app, name: "spotify-selection-in-editor")
    }

    func testEverySupportedSocialPlatformReturnsValidatedLinkToEditor() {
        let cases = [
            ("spotify", "Spotify", "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"),
            ("youtube", "YouTube", "https://youtu.be/abc123"),
            ("facebook", "Facebook", "https://www.facebook.com/loci/posts/123"),
            ("instagram", "Instagram", "https://www.instagram.com/p/ABC123/"),
            ("x", "X", "https://x.com/loci/status/123"),
        ]

        for (identifier, displayName, url) in cases {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
            app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = url
            app.launch()
            XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
            app.buttons["create-external-media-picker"].tap()
            XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 3))
            app.buttons["external-platform-\(identifier)"].tap()
            app.buttons["external-import-complete"].tap()

            let linkField = app.textFields["create-external-media"]
            XCTAssertTrue(linkField.waitForExistence(timeout: 3), "\(displayName) editöre dönmedi.")
            XCTAssertEqual(linkField.value as? String, url)
            XCTAssertTrue(app.staticTexts["\(displayName) paylaşımı hazır"].exists)
            app.terminate()
        }
    }

    func testInvalidSocialURLStaysInPickerWithExplicitError() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = "https://x.com.example.org/loci/status/123"
        app.launch()
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
        app.buttons["create-external-media-picker"].tap()
        app.buttons["external-platform-x"].tap()
        app.buttons["external-import-complete"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "geçerli bir X paylaşım bağlantısı bulunamadı")).firstMatch.waitForExistence(timeout: 3))
    }

    func testSpotifyIconOpensExternalDestination() {
        let app = XCUIApplication()
        let spotify = XCUIApplication(bundleIdentifier: "com.spotify.client")
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"]
        app.launch()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 3))
        app.buttons["external-platform-spotify"].tap()

        let deadline = Date().addingTimeInterval(6)
        while spotify.state != .runningForeground,
              safari.state != .runningForeground,
              Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertTrue(
            spotify.state == .runningForeground || safari.state == .runningForeground,
            "Spotify veya güvenli web yedeği açılmadı."
        )
    }
}
