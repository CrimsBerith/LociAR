import XCTest

/// Inert local data only: checks the failures seen in the physical screenshot baseline.
@MainActor
final class ReadabilityRegressionUITests: XCTestCase {
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT",
            "-hasCompletedOnboarding", "YES", "-AppleLanguages", "(tr)", "-AppleLocale", "tr_TR"
        ] + extra
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        return app
    }

    private func record(_ app: XCUIApplication, name: String, emitHierarchy: Bool = false) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let hierarchy = app.debugDescription
        let tree = XCTAttachment(string: hierarchy)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        add(tree)
        if emitHierarchy { print("READABILITY_AX_\(name)\n\(hierarchy)") }
    }

    private func require(_ element: XCUIElement, in app: XCUIApplication, name: String) -> Bool {
        guard element.waitForExistence(timeout: 5) else {
            record(app, name: "missing-" + name, emitHierarchy: true)
            XCTFail("Missing accessibility element: \(name)")
            return false
        }
        record(app, name: name)
        return true
    }

    func testDiscoverPaginationRemainsCompactAndDismissesAtEnd() {
        let app = launch(["UITEST_DISCOVER_PAGINATION"])
        app.tabBars.buttons["Keşfet"].tap()
        app.swipeUp()
        let nextPage = app.buttons["discover-load-more"]
        guard require(nextPage, in: app, name: "discover-load-more") else { return }
        XCTAssertTrue(nextPage.isHittable)
        XCTAssertLessThan(nextPage.frame.height, app.frame.height * 0.15,
                          "Pagination must stay compact at the end of the feed")
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].exists)
        nextPage.tap()
        let disappears = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: nextPage)
        XCTAssertEqual(XCTWaiter.wait(for: [disappears], timeout: 5), .completed)
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].exists)
    }

    func testDiscoverLoadFailureDoesNotClaimAnEmptyFeed() {
        let app = launch(["UITEST_DISCOVER_ERROR"])
        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.staticTexts["Şu anda yüklenemiyor"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Tekrar dene"].isHittable)
        XCTAssertFalse(app.staticTexts["Henüz not yok"].exists)
        XCTAssertFalse(app.staticTexts["Sonuç bulunamadı"].exists)
    }

    func testListBadgeKeepsItsTextWithoutStretchingTheCard() {
        let app = launch()
        app.tabBars.buttons["Keşfet"].tap()
        let badge = app.descendants(matching: .any)["post-kind-badge"].firstMatch
        XCTAssertTrue(badge.waitForExistence(timeout: 5))
        XCTAssertTrue(badge.label.contains("Sabit"), badge.label)
        XCTAssertLessThan(badge.frame.height, 50,
                          "The status label in a NavigationLink must not become a vertical capsule")
    }

    func testSingleMapPreviewDoesNotReserveTheScrollableListMaximum() {
        let app = launch()
        app.tabBars.buttons["Harita"].tap()
        XCTAssertTrue(app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].firstMatch.waitForExistence(timeout: 5))
        let panel = app.descendants(matching: .any)["map-preview-panel"].firstMatch
        guard require(panel, in: app, name: "map-preview-panel") else { return }
        XCTAssertGreaterThan(panel.frame.height, 50)
        XCTAssertLessThan(panel.frame.height, app.frame.height * 0.32,
                          "A single preview should leave the map visible rather than fill the 220pt cap")
        XCTAssertTrue(app.descendants(matching: .any)["map-open-Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."].firstMatch.isHittable)
    }

    func testAppearancePickerOffersSystemLightAndDarkModes() {
        let app = launch()
        app.tabBars.buttons["Profil"].tap()
        let settings = app.buttons["profile-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()

        let picker = app.segmentedControls["settings-appearance"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        for option in ["Sistem", "Aydınlık", "Karanlık"] {
            XCTAssertTrue(picker.buttons[option].exists, "Missing appearance option: \(option)")
            picker.buttons[option].tap()
            XCTAssertEqual(picker.value as? String, option)
        }
    }
}
