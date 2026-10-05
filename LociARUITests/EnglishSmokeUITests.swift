import XCTest

/// The app is localized into 12 languages (Localizable.xcstrings, keys = Turkish source text).
/// Runs the main screens in English to catch strings that bypass the catalog.
@MainActor
final class EnglishSmokeUITests: XCTestCase {
    private func launchEnglish(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        // Passing -AppleLanguages explicitly also opts out of AuthGateUITests' Turkish default.
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + extra
        app.launch()
        return app
    }

    func testSignedOutScreenIsEnglish() {
        let app = launchEnglish(["UITEST_SIGNED_OUT"])
        XCTAssertTrue(app.textFields["auth-email-field"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Stories tied to real places."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Forgot password"].exists || app.staticTexts["Forgot password"].exists)
        XCTAssertFalse(app.staticTexts["Gerçek mekânlara bağlı hikâyeler."].exists)
        let consent = app.descendants(matching: .any)["auth-terms-consent"]
        XCTAssertTrue(consent.exists)
        XCTAssertTrue(consent.label.contains("privacy policy"), consent.label)
    }

    func testTabsAreEnglish() {
        let app = launchEnglish(["UITEST_AUTHENTICATED"])
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 5))
        for title in ["AR", "Map", "Share", "Explore", "Profile"] {
            XCTAssertTrue(tabs.buttons[title].exists, "missing English tab \(title)")
        }
        tabs.buttons["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 3))
    }
}
