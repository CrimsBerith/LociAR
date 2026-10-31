import ObjectiveC.runtime
import UIKit
import XCTest

// Current-build screen inventory. Uses inert repositories and never submits real content or payments.
extension AuthGateUITests {
    private func screenTourApp(_ arguments: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"] + arguments
        app.launch()
        return app
    }

    private func screenTourProfile(_ app: XCUIApplication) {
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["profile-support-earnings"].exists)
    }

    func testScreenTour01Onboarding() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-hasCompletedOnboarding", "NO"]
        app.launch()
        XCTAssertTrue(app.buttons["onboarding-next"].waitForExistence(timeout: 10))
        capture(app, name: "screen-01-onboarding-place")
        app.buttons["onboarding-next"].tap()
        XCTAssertTrue(app.staticTexts["Yakınındaki notları keşfet"].waitForExistence(timeout: 5))
        capture(app, name: "screen-02-onboarding-discover")
        app.buttons["onboarding-next"].tap()
        XCTAssertTrue(app.buttons["onboarding-finish"].waitForExistence(timeout: 5))
        capture(app, name: "screen-03-onboarding-privacy")
    }

    func testScreenTour02Authentication() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_SIGNED_OUT"]
        app.launch()
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 10))
        capture(app, name: "screen-04-auth-signin")
        app.buttons["auth-mode-signup"].tap()
        XCTAssertTrue(app.secureTextFields["auth-confirm-password-field"].waitForExistence(timeout: 5))
        capture(app, name: "screen-05-auth-signup")
        app.buttons["auth-mode-signin"].tap()
        app.buttons["auth-forgot-password"].tap()
        XCTAssertTrue(app.navigationBars["Şifremi unuttum"].waitForExistence(timeout: 5))
        capture(app, name: "screen-06-auth-password-recovery")
    }

    func testScreenTour03PrimaryTabs() {
        let app = screenTourApp()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["map-location-note"].waitForExistence(timeout: 10))
        capture(app, name: "screen-07-map")
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 5))
        capture(app, name: "screen-08-ar-discover")
        if app.buttons["arcore-notice"].exists {
            app.buttons["arcore-notice"].tap()
            XCTAssertTrue(app.alerts["Google AR"].waitForExistence(timeout: 5))
            capture(app, name: "screen-09-google-ar-disclosure")
            app.alerts["Google AR"].buttons["Tamam"].tap()
        }
        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 8))
        capture(app, name: "screen-10-share-ar-placement")
        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].waitForExistence(timeout: 5))
        capture(app, name: "screen-11-discover")
        screenTourProfile(app)
        capture(app, name: "screen-12-profile")
        scrollUntilHittable(app.buttons["profile-delete-account"], in: app, maxSwipes: 8)
        capture(app, name: "screen-13-profile-account-actions")
        // The inert preview account deliberately disables account deletion.
        XCTAssertFalse(app.buttons["profile-delete-account"].isEnabled)
    }

    func testScreenTour04ProfileLists() {
        let app = screenTourApp()
        screenTourProfile(app)
        for (route, title, name) in [
            ("Notlarım", "Notlarım", "screen-15-my-posts"),
            ("Aktivite", "Aktivite", "screen-16-activity"),
            ("Koleksiyonlar", "Koleksiyonlar", "screen-17-collections"),
            ("Kaydedilenler", "Kaydedilenler", "screen-19-saved-posts"),
            ("Engellenen hesaplar", "Engellenenler", "screen-20-blocked-users"),
            ("Davet kodu", "Davet kodu", "screen-21-invite")
        ] {
            let entry = app.staticTexts[route]
            scrollUntilHittable(entry, in: app, maxSwipes: 8)
            entry.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
            capture(app, name: name)
            if route == "Koleksiyonlar" {
                app.buttons["Yeni"].tap()
                XCTAssertTrue(app.alerts["Yeni koleksiyon"].waitForExistence(timeout: 5))
                capture(app, name: "screen-18-new-collection")
                app.alerts.textFields.firstMatch.tap()
                app.alerts.textFields.firstMatch.typeText("Şehir notları")
                app.alerts.buttons["Oluştur"].tap()
                XCTAssertTrue(app.staticTexts["Şehir notları"].waitForExistence(timeout: 5))
                capture(app, name: "screen-18b-collection-created")
                app.staticTexts["Şehir notları"].tap()
                XCTAssertTrue(app.navigationBars["Şehir notları"].waitForExistence(timeout: 5))
                capture(app, name: "screen-18c-collection-detail")
                app.navigationBars.buttons.element(boundBy: 0).tap()
                XCTAssertTrue(app.navigationBars["Koleksiyonlar"].waitForExistence(timeout: 5))
            }
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        }
    }

    func testScreenTour05SettingsAndProfileEdit() {
        let app = screenTourApp()
        screenTourProfile(app)
        app.buttons["profile-edit-button"].tap()
        XCTAssertTrue(app.navigationBars["Profili düzenle"].waitForExistence(timeout: 5))
        capture(app, name: "screen-22-edit-profile")
        scrollUntilHittable(app.buttons["profile-edit-photo"], in: app, maxSwipes: 8)
        capture(app, name: "screen-23-edit-profile-avatars")
        app.buttons["Vazgeç"].tap()
        let settings = app.buttons["profile-settings"]
        scrollUntilHittable(settings, in: app, maxSwipes: 8)
        settings.tap()
        XCTAssertTrue(app.navigationBars["Ayarlar"].waitForExistence(timeout: 5))
        capture(app, name: "screen-24-settings-overview")
        for (page, control, shot) in [
            ("notifications", "settings-notifications", "screen-24b-notifications"),
            ("privacy", "settings-share-admin-location", "screen-25-privacy"),
            ("translation", "settings-translate-notes", "screen-26-translation"),
            ("diagnostics", "settings-crash-reports", "screen-26b-diagnostics")
        ] {
            app.buttons["settings-open-\(page)"].tap()
            XCTAssertTrue(identifiedControl(app, control).waitForExistence(timeout: 5))
            capture(app, name: shot)
            app.navigationBars.buttons.firstMatch.tap()
        }
    }

    func testScreenTour06PostAndSafety() {
        let app = screenTourApp(["UITEST_OTHER_USER", "UITEST_OPEN_POST_DIRECTLY"])
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["post-like-button"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["post-support-button"].exists)
        capture(app, name: "screen-27-post-detail-no-donations")
        let report = app.buttons["post-report"]
        scrollUntilHittable(report, in: app)
        report.tap()
        XCTAssertTrue(app.buttons["Spam veya yanıltıcı"].waitForExistence(timeout: 5))
        capture(app, name: "screen-28-report-reasons")
        // iOS may present confirmationDialog as a popover without a cancel row.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.70)).tap()
        let more = app.buttons["post-more-menu"]
        scrollUntilHittable(more, in: app)
        more.tap()
        app.buttons["post-add-to-collection"].tap()
        XCTAssertTrue(app.navigationBars["Koleksiyonlar"].waitForExistence(timeout: 5))
        capture(app, name: "screen-29-add-post-to-collection")
        app.buttons["Kapat"].tap()
        let profile = app.buttons["post-open-profile"]
        scrollUntilHittable(profile, in: app, maxSwipes: 6)
        profile.tap()
        let blockButton = app.buttons["profile-block-user"]
        scrollUntilHittable(blockButton, in: app, maxSwipes: 6)
        XCTAssertTrue(blockButton.waitForExistence(timeout: 5))
        capture(app, name: "screen-30-public-profile")
        blockButton.tap()
        let confirmBlock = app.buttons["Engelle"]
        if !confirmBlock.waitForExistence(timeout: 2) {
            scrollUntilHittable(blockButton, in: app, maxSwipes: 2)
            blockButton.tap()
        }
        XCTAssertTrue(confirmBlock.waitForExistence(timeout: 5))
        capture(app, name: "screen-31-block-confirmation")
        if app.buttons["Vazgeç"].waitForExistence(timeout: 1) {
            app.buttons["Vazgeç"].tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.70)).tap()
        }
    }

    func testScreenTour07EditorAndGIF() {
        let app = screenTourApp(["UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"])
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 10))
        capture(app, name: "screen-32-create-editor")
        let gif = app.buttons["GIF ekle"]
        scrollUntilHittable(gif, in: app, maxSwipes: 6)
        gif.tap()
        XCTAssertTrue(app.navigationBars["GIF seç"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["gif-attribution"].exists || app.descendants(matching: .any)["gif-attribution"].exists)
        capture(app, name: "screen-33-giphy-picker")
    }

    func testScreenTour08LocationNoteAndSurface() {
        let app = screenTourApp()
        XCTAssertTrue(app.buttons["map-location-note"].waitForExistence(timeout: 10))
        app.buttons["map-location-note"].tap()
        XCTAssertTrue(app.navigationBars["Konum notu bırak"].waitForExistence(timeout: 5))
        capture(app, name: "screen-34-location-note-position")
        let field = identifiedControl(app, "place-note-text")
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        field.tap()
        field.typeText("Bu sokakta bir an dur, şehri dinle.")
        dismissKeyboard(app)
        scrollUntilHittable(app.buttons["place-note-publish"], in: app, maxSwipes: 6)
        capture(app, name: "screen-35-location-note-draft")
        app.buttons["Kapat"].tap()
        app.buttons["map-create"].tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 5))
        capture(app, name: "screen-36-create-surface")
    }

    func testScreenTour09ARViewer() {
        let app = screenTourApp(["UITEST_OTHER_USER", "UITEST_OPEN_POST_DIRECTLY"])
        XCTAssertTrue(app.buttons["post-open-ar"].waitForExistence(timeout: 10))
        app.buttons["post-open-ar"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["ar-post-viewer"].waitForExistence(timeout: 10))
        capture(app, name: "screen-37-ar-post-viewer")
    }

    func testScreenTour10PermissionRecovery() {
        let app = screenTourApp(["UITEST_CAMERA_DENIED"])
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["Kamera ayarlarını aç"].waitForExistence(timeout: 8))
        capture(app, name: "screen-38-camera-permission-recovery")
        app.terminate()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_LOCATION_DENIED"]
        app.launch()
        XCTAssertTrue(app.buttons["Ayarlar"].waitForExistence(timeout: 8))
        capture(app, name: "screen-39-location-permission-recovery")
    }

    func testScreenTour11GuestAccount() {
        let app = screenTourApp(["UITEST_GUEST_ACCOUNT"])
        XCTAssertTrue(app.buttons["auth-mode-signin"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        XCTAssertFalse(app.buttons["auth-anonymous"].exists)
        capture(app, name: "screen-40-legacy-guest-membership-gate")
    }

    func testScreenTour12ARCoreDiagnostics() {
        let app = screenTourApp()
        screenTourProfile(app)
        let coverage = app.buttons["profile-debug-arcore"]
        scrollUntilHittable(coverage, in: app, maxSwipes: 8)
        coverage.tap()
        XCTAssertTrue(app.navigationBars["ARCore kapsamı"].waitForExistence(timeout: 5))
        capture(app, name: "screen-43-arcore-debug-coverage")
    }
}

extension XCUIApplication {
    @objc dynamic func loci_launch() {
        if ProcessInfo.processInfo.environment["E2E_DEMO_EMULATOR_HTTP"] == "1" {
            launchEnvironment["LOCIAR_DEMO_EMULATOR_HTTP"] = "1"
        }
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
    override func setUp() {
        super.setUp()
        MainActor.assumeIsolated { _ = XCUIApplication.swizzleLaunchOnce }
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

    func testNewNotesDefaultToAnonymousAndAllowUsername() {
        continueAfterFailure = false
        let app = XCUIApplication()
        for editor in [false, true] {
            app.launchArguments = ["UITEST_AUTHENTICATED"]
            if editor { app.launchArguments += ["UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"] }
            app.launch()
            if !editor {
                XCTAssertTrue(app.buttons["map-location-note"].waitForExistence(timeout: 10))
                app.buttons["map-location-note"].tap()
            }
            let identity = app.switches["publish-anonymously"]
            scrollUntilHittable(identity, in: app, maxSwipes: 8)
            XCTAssertTrue(identity.waitForExistence(timeout: 5))
            XCTAssertEqual(identity.value as? String, "1")
            capture(app, name: editor ? "ar-note-anonymous-default" : "location-note-anonymous-default")
            identity.coordinate(withNormalizedOffset: CGVector(dx: 0.84, dy: 0.5)).tap()
            let attributed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '0'"), object: identity)
            XCTAssertEqual(XCTWaiter.wait(for: [attributed], timeout: 5), .completed)
            XCTAssertTrue(app.staticTexts[editor ? "Kullanıcı adın notta görünür." : "Kullanıcı adın, notun ve konumu hemen paylaşılır."].exists)
            capture(app, name: editor ? "ar-note-username-selected" : "location-note-username-selected")
            app.terminate()
        }
    }

    func testMembershipRequiredForAppEntry() {
        continueAfterFailure = false
        let app = XCUIApplication()
        for arguments in [["UITEST_SIGNED_OUT"], ["UITEST_AUTHENTICATED", "UITEST_GUEST_ACCOUNT"]] {
            app.launchArguments = arguments
            app.launch()
            XCTAssertTrue(app.buttons["auth-mode-signin"].waitForExistence(timeout: 8))
            XCTAssertTrue(app.buttons["auth-mode-signup"].exists)
            XCTAssertFalse(app.buttons["auth-anonymous"].exists)
            XCTAssertFalse(app.buttons["auth-device-preview"].exists)
            XCTAssertFalse(app.tabBars.firstMatch.exists)
            capture(app, name: "membership-required")
            app.terminate()
        }
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
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue
        ]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Profil"].tap()
        let saved = app.staticTexts["Kaydedilenler"]
        scrollUntilHittable(saved, in: app, maxSwipes: 10)
        XCTAssertTrue(saved.waitForExistence(timeout: 3))
        let privacy = app.staticTexts["Tercihler"]
        scrollUntilHittable(privacy, in: app, maxSwipes: 10)
        XCTAssertTrue(privacy.exists)
        let deletionWarning = app.staticTexts["Hesap silme işlemi geri alınamaz."]
        scrollUntilHittable(deletionWarning, in: app, maxSwipes: 10)
        XCTAssertTrue(deletionWarning.waitForExistence(timeout: 3))
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
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_SIGNED_OUT")
        app.launch()
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 5))
        let consent = identifiedControl(app, "auth-terms-consent")
        if consent.isSelected { consent.tap() }
        XCTAssertFalse(consent.isSelected)
        XCTAssertTrue(app.secureTextFields["auth-password-field"].exists)
        XCTAssertTrue(app.buttons["auth-email-submit"].exists)
        XCTAssertTrue(app.buttons["auth-apple"].exists)
        XCTAssertFalse(app.buttons["auth-apple"].isEnabled, "Apple sign-in requires consent")
        XCTAssertTrue(identifiedControl(app, "auth-privacy").waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "auth-terms").exists)
        XCTAssertTrue(identifiedControl(app, "auth-terms-consent").exists)
        XCTAssertTrue(identifiedControl(app, "auth-support").exists)
        consent.tap()
        XCTAssertTrue(app.buttons["auth-apple"].isEnabled)
        consent.tap()
        XCTAssertFalse(app.buttons["auth-apple"].isEnabled)
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
        XCTAssertTrue(app.staticTexts["Yakındaki notlar"].waitForExistence(timeout: 10))
        let row = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "map-open-"))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "Harita yakındaki postları yüklemedi")
        XCTAssertFalse(app.staticTexts["Yakın çevre taranıyor"].exists)
        XCTAssertGreaterThanOrEqual(row.frame.height, 44, "Not satırı erişilebilir bir dokunma alanı sağlamalı.")
        row.tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 8))
    }

    func testCameraFreeNoteUsesServerUnicodeLengthLimit() {
        continueAfterFailure = false
        let app = XCUIApplication()
        // A denial left by another test must not mask text validation.
        app.resetAuthorizationStatus(for: .location)
        addPrivacyAlertMonitor()
        app.launchArguments = ["UITEST_AUTHENTICATED"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        app.tabBars.buttons["Harita"].tap()
        for (text, allowed) in [(String(repeating: "😀", count: 110), true),
                                (String(repeating: "😀", count: 111), false),
                                (String(repeating: "e\u{301}", count: 111), false),
                                ("  " + String(repeating: "a", count: 220) + "  ", true)] {
            app.buttons["map-location-note"].tap()
            let field = identifiedControl(app, "place-note-text")
            scrollUntilHittable(field, in: app, maxSwipes: 6)
            field.tap()
            field.typeText(text)
            XCTAssertEqual(field.value as? String, text, "Unicode fixture must reach the real input intact.")
            dismissKeyboard(app)
            XCTAssertFalse(app.keyboards.firstMatch.exists, "Küçük ekranda da klavye kapatılıp yayın düğmesine ulaşılmalı.")
            let publish = app.buttons["place-note-publish"]
            scrollUntilHittable(publish, in: app, maxSwipes: 6)
            XCTAssertEqual(publish.isEnabled, allowed, "The input must obey the same limit as createPlaceNote.")
            app.buttons["Kapat"].tap()
        }
    }

    func testCameraFreeComposerAndNotificationSettingsInAllTwelveLanguages() {
        continueAfterFailure = false
        let languages = ["tr", "en", "zh-Hans", "hi", "es", "fr", "ar", "bn", "pt", "ru", "de", "ja"]
        for language in languages {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "-AppleLanguages", "(\(language))", "-AppleLocale", language]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), language)
            app.tabBars.buttons.element(boundBy: 1).tap()
            app.buttons["map-location-note"].tap()
            scrollUntilHittable(identifiedControl(app, "place-note-text"), in: app, maxSwipes: 6)
            XCTAssertTrue(identifiedControl(app, "place-note-text").waitForExistence(timeout: 10), language)
            scrollUntilHittable(app.buttons["place-note-publish"], in: app, maxSwipes: 6)
            XCTAssertTrue(app.buttons["place-note-publish"].exists, language)
            XCTAssertFalse(app.buttons["place-note-publish"].isEnabled, language)
            XCTAssertFalse(app.buttons["ar-pin-surface"].exists, language)
            capture(app, name: "camera-free-composer-\(language)")
            app.navigationBars.buttons.firstMatch.tap()
            app.tabBars.buttons.element(boundBy: 4).tap()
            scrollUntilHittable(app.buttons["profile-settings"], in: app, maxSwipes: 6)
            app.buttons["profile-settings"].tap()
            app.buttons["settings-open-notifications"].tap()
            XCTAssertTrue(app.switches["settings-notifications"].waitForExistence(timeout: 10), language)
            XCTAssertTrue(app.switches["settings-promotions"].exists, language)
            capture(app, name: "notification-settings-\(language)")
            app.navigationBars.buttons.firstMatch.tap()
            app.buttons["settings-open-translation"].tap()
            let translation = app.switches["settings-translate-notes"]
            scrollUntilHittable(translation, in: app, maxSwipes: 6)
            XCTAssertTrue(translation.exists, language)
            XCTAssertTrue(translation.isEnabled, language)
            capture(app, name: "translation-settings-\(language)")
            app.terminate()
        }
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
        scrollUntilHittable(identifiedControl(app, "profile-privacy"), in: app)
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
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT"]
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
        scrollUntilHittable(identifiedControl(app, "profile-privacy"), in: app)
        XCTAssertTrue(identifiedControl(app, "profile-privacy").waitForExistence(timeout: 3))
        XCTAssertTrue(identifiedControl(app, "profile-terms").exists)
        XCTAssertTrue(identifiedControl(app, "profile-support").exists)
        scrollUntilHittable(app.buttons["profile-delete-account"], in: app)
        XCTAssertTrue(app.buttons["profile-delete-account"].isHittable)

        tabs.buttons["Keşfet"].tap()
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].waitForExistence(timeout: 5))
        app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["post-report"].waitForExistence(timeout: 3))
        app.buttons["post-open-profile"].tap()
        XCTAssertTrue(app.buttons["profile-block-user"].waitForExistence(timeout: 3))
    }

    func testOwnPostDoesNotOfferReportOrBlock() {
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["post-like-button"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["post-report"].exists)
        XCTAssertTrue(app.buttons["post-more-menu"].exists)
        XCTAssertFalse(app.buttons["post-support-button"].exists)
        app.buttons["post-more-menu"].tap()
        XCTAssertTrue(app.buttons["post-add-to-collection"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["post-block-user"].exists)
    }

    func testSupportOpensFromRightmostPostActionWithoutShowingAnAuthorOrFakePayment() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY"]
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app)
        XCTAssertTrue(support.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(support.frame.midX, app.buttons["post-like-button"].frame.midX)
        XCTAssertGreaterThan(support.frame.midX, app.buttons["post-save-button"].frame.midX)
        XCTAssertGreaterThanOrEqual(support.frame.width, 44)
        XCTAssertGreaterThanOrEqual(support.frame.height, 44)
        capture(app, name: "support-rightmost-action")
        support.tap()
        XCTAssertTrue(app.navigationBars["Yazara destek ol"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Destek ödemeleri henüz kullanıma açık değil."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Desteğinin %72’si yazara ayrılır. Kalan tutar ödeme ve platform masraflarını karşılar."].exists)
        XCTAssertTrue(app.staticTexts["Yazarın kimliği ve ödeme hesabı paylaşılmaz."].exists)
        XCTAssertFalse(app.buttons["support-pay"].exists)
        capture(app, name: "support-unconfigured-state")
        app.buttons["Tekrar dene"].tap()
        XCTAssertTrue(app.staticTexts["Destek ödemeleri henüz kullanıma açık değil."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
    }

    func testSupportUnavailableStateRemainsUsableAtAccessibilityXXXL() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT",
                               "UITEST_OPEN_POST_DIRECTLY", "-UIPreferredContentSizeCategoryName",
                               UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue]
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app, maxSwipes: 10)
        XCTAssertTrue(support.isHittable)
        support.tap()
        XCTAssertTrue(app.navigationBars["Yazara destek ol"].waitForExistence(timeout: 5))
        let retry = app.buttons["Tekrar dene"]
        scrollUntilHittable(retry, in: app, maxSwipes: 10)
        XCTAssertTrue(retry.isHittable)
        XCTAssertFalse(app.buttons["support-pay"].exists)
        capture(app, name: "support-accessibility-xxxl")
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
    }

    func testSupportEarningsShowsUnavailableInsteadOfAnInventedBalance() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED"]
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Profil"].tap()
        let earnings = app.buttons["profile-support-earnings"]
        scrollUntilHittable(earnings, in: app)
        XCTAssertTrue(earnings.isHittable)
        earnings.tap()
        XCTAssertTrue(app.navigationBars["Kazançlarım"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Destek tutarının %72’si yazar kazancı olarak kaydedilir."].exists)
        XCTAssertTrue(app.staticTexts["Destek ödemeleri henüz kullanıma açık değil."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Henüz destek kazancın yok."].exists)
        XCTAssertFalse(app.staticTexts["Bekleyen kazanç"].exists)
        capture(app, name: "support-earnings-unavailable")
    }

    func testSupportRestoresPendingAfterRelaunchWithoutNeedingThePriceCatalog() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY",
                               "UITEST_SUPPORT_PENDING", "UITEST_SUPPORT_CATALOG_UNAVAILABLE"]
        for launch in 0..<2 {
            app.launchArguments.append("UITEST_SUPPORT_UI")
            app.launch()
            let support = app.buttons["post-support-button"]
            scrollUntilHittable(support, in: app)
            support.tap()
            XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
            XCTAssertFalse(app.buttons["support-pay"].exists)
            app.buttons["support-check-status"].tap()
            XCTAssertFalse(app.buttons["support-pay"].exists)
            capture(app, name: "support-recovered-pending-\(launch)")
            app.terminate()
        }
    }

    func testSupportAllowsANewAttemptOnlyAfterProviderConfirmedExpiry() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY",
                               "UITEST_SUPPORT_PENDING", "UITEST_SUPPORT_EXPIRED"]
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app)
        support.tap()
        XCTAssertTrue(app.staticTexts["Ödeme süresi doldu. Yeniden destek gönderebilirsin."].waitForExistence(timeout: 5))
        let pay = app.buttons["support-pay"]
        scrollUntilHittable(pay, in: app)
        XCTAssertTrue(pay.isEnabled)
        XCTAssertFalse(app.buttons["support-check-status"].exists)
        capture(app, name: "support-provider-confirmed-expiry")
    }

    func testPendingSupportCannotResumeExternalCheckoutOutsideTheAllowedStorefront() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY",
                               "UITEST_SUPPORT_PENDING", "UITEST_SUPPORT_FOREIGN_STOREFRONT"]
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app)
        support.tap()
        XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-resume"].exists)
        XCTAssertFalse(app.buttons["support-pay"].exists)
        capture(app, name: "support-pending-outside-us-storefront")
    }

    func testSupportStripeTimeoutRecoversWithoutAnotherPayButton() {
        assertSupportTimeoutRecovers(scenario: "checkout_timeout_stripe")
    }

    func testSupportCryptoTimeoutRecoversWithoutAnotherInvoice() {
        assertSupportTimeoutRecovers(scenario: "checkout_timeout_crypto")
    }

    private func assertSupportTimeoutRecovers(scenario: String) {
        continueAfterFailure = false
        let app = openSupport(scenario: scenario)
        let pay = app.buttons["support-pay"]
        XCTAssertTrue(pay.waitForExistence(timeout: 5))
        scrollUntilHittable(pay, in: app)
        XCTAssertTrue(pay.isEnabled)
        pay.tap()
        XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
        XCTAssertFalse(pay.exists)
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
        app.buttons["support-check-status"].tap()
        XCTAssertTrue(app.buttons["support-check-status"].isEnabled)
        XCTAssertFalse(pay.exists)
        capture(app, name: scenario)
        app.buttons["Kapat"].tap()
        app.buttons["post-support-button"].tap()
        XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
    }

    func testSupportTimeoutWithFailedRecoveryRequiresReadBeforeNewPayment() {
        continueAfterFailure = false
        let app = openSupport(scenario: "checkout_timeout_recovery_unavailable")
        let pay = app.buttons["support-pay"]
        XCTAssertTrue(pay.waitForExistence(timeout: 5))
        scrollUntilHittable(pay, in: app)
        pay.tap()
        let retry = app.buttons["Tekrar dene"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        XCTAssertFalse(pay.exists)
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
        retry.tap()
        XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
        XCTAssertFalse(pay.exists)
        capture(app, name: "support-timeout-recovery-unavailable")
    }

    func testSupportShowsSuccessOnlyAfterVerifiedReceipt() {
        continueAfterFailure = false
        let app = openSupport(scenario: "confirmed")
        let check = app.buttons["support-check-status"]
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
        check.tap()
        XCTAssertTrue(app.staticTexts["Desteğin kaydedildi"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Test ödemesi · gerçek para değildir."].exists)
        XCTAssertFalse(app.buttons["support-pay"].exists)
        XCTAssertFalse(check.exists)
        capture(app, name: "support-verified-sandbox-receipt")
        app.buttons["Nota dön"].tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
    }

    func testSupportRestoresCompletedPaymentAndRequiresAnExplicitRepeat() {
        continueAfterFailure = false
        let app = openSupport(scenario: "settled_before_launch")
        XCTAssertTrue(app.staticTexts["Desteğin kaydedildi"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
        capture(app, name: "support-completed-before-relaunch")
        app.terminate()
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app)
        support.tap()
        XCTAssertTrue(app.staticTexts["Desteğin kaydedildi"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
        app.buttons["support-send-again"].tap()
        XCTAssertTrue(app.buttons["support-pay"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
        capture(app, name: "support-deliberate-repeat")
        let pay = app.buttons["support-pay"]
        scrollUntilHittable(pay, in: app)
        pay.tap()
        XCTAssertTrue(app.buttons["support-check-status"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
    }

    func testSupportRefundDoesNotShowPaymentSuccessOrAnotherPayButton() {
        continueAfterFailure = false
        let app = openSupport(scenario: "refunded")
        let check = app.buttons["support-check-status"]
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        check.tap()
        XCTAssertTrue(app.staticTexts["Bu destek ödemesi iade edildi."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Desteğin kaydedildi"].exists)
        XCTAssertFalse(app.buttons["support-pay"].exists)
        XCTAssertFalse(check.exists)
        capture(app, name: "support-refunded-receipt")
    }

    func testSupportStatusFailureKeepsTheUnsettledPaymentAndAllowsDismissal() {
        continueAfterFailure = false
        let app = openSupport(scenario: "refresh_unavailable")
        let check = app.buttons["support-check-status"]
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        check.tap()
        XCTAssertTrue(app.staticTexts["Ödeme henüz doğrulanamadı. Tekrar ödeme yapmadan durumunu kontrol et."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["support-pay"].exists)
        XCTAssertTrue(check.isEnabled)
        capture(app, name: "support-status-unavailable")
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
    }

    func testSupportPendingArabicLocalizationRemainsUsable() {
        continueAfterFailure = false
        let app = openSupport(scenario: "refresh_unavailable", language: "ar")
        let check = app.buttons["support-check-status"]
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        scrollUntilHittable(check, in: app)
        XCTAssertTrue(check.isHittable)
        XCTAssertNotEqual(check.label, "Ödeme durumunu kontrol et")
        XCTAssertFalse(app.buttons["support-pay"].exists)
        capture(app, name: "support-pending-arabic")
    }

    private func openSupport(scenario: String, language: String = "tr") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_OTHER_USER", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY",
                               "-AppleLanguages", "(\(language))", "-AppleLocale", language == "ar" ? "ar_SA" : "tr_TR"]
        app.launchEnvironment["UITEST_SUPPORT_SCENARIO"] = scenario
        app.launchArguments.append("UITEST_SUPPORT_UI")
        app.launch()
        let support = app.buttons["post-support-button"]
        scrollUntilHittable(support, in: app)
        XCTAssertTrue(support.waitForExistence(timeout: 5))
        support.tap()
        return app
    }

    func testDeviceTranslationKeepsOriginalWhenEngineIsUnavailable() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["note-translation-unavailable"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["note-translation-unavailable"].firstMatch.label, "Translation is unavailable on this device or for this language.")
        XCTAssertFalse(app.buttons["note-translate"].exists)
        XCTAssertFalse(app.buttons["note-translation-original"].exists)
        capture(app, name: "device-translation-original-fallback-en")
    }

    func testOfficialContentBadgePreservesTheSelectedAuthor() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY", "UITEST_OFFICIAL_CONTENT"]
        app.launch()
        XCTAssertTrue(app.otherElements["post-official-badge"].firstMatch.waitForExistence(timeout: 8)
                      || app.descendants(matching: .any)["post-official-badge"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["@mekan_kasifi"].firstMatch.exists)
        XCTAssertLessThan(app.staticTexts["Sabit"].firstMatch.frame.height, 25, "The provenance badge must not wrap the placement status.")
        capture(app, name: "official-note-badge")
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

        for route in ["Notlarım", "Aktivite", "Koleksiyonlar", "Kaydedilenler", "Engellenen hesaplar"] {
            let entry = app.staticTexts[route]
            scrollUntilHittable(entry, in: app, maxSwipes: 6)
            entry.tap()
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
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 3))
        capture(app, name: "06-post-detail")
        app.buttons["post-open-profile"].tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 3))
        capture(app, name: "07-public-profile")

        app.terminate()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launch()
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["create-caption"].exists)
        // Social media links were removed on 9 Oct 2026: the editor offers text only.
        XCTAssertFalse(app.buttons["create-external-media-picker"].exists)
        XCTAssertFalse(app.textFields["create-external-media"].exists)
        XCTAssertFalse(app.staticTexts["Açıklama"].exists)
        XCTAssertFalse(app.staticTexts["Çizim ekle"].exists)
        XCTAssertFalse(app.staticTexts["Bağlantı ekle"].exists)
        capture(app, name: "08-create-editor")
    }

}
