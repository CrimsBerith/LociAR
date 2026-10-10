import UIKit
import XCTest

/// End-to-end user flows on the simulator with sample content.
extension AuthGateUITests {
    func testUserFlowCreateARPostAndViewIt() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_SAMPLE_CONTENT"]
        app.launch()

        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8))
        app.buttons["map-create"].tap()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8))
        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText("LociAR AR Post")
        let kbDone1 = app.buttons["keyboard-done-button"]
        if kbDone1.waitForExistence(timeout: 1) { kbDone1.tap() }

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        publishButton.tap()

        let alert = app.alerts["LociAR"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        alert.buttons["Tamam"].tap()

        // Editor dismissed, navigate to AR tab to view the AR post
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 8))
        tabs.buttons["AR"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 8))

        let nearbyPost = app.buttons["ar-nearby-post-33333333-3333-3333-3333-333333333333"]
        XCTAssertTrue(nearbyPost.waitForExistence(timeout: 10))
        nearbyPost.tap()

        XCTAssertTrue(app.otherElements["ar-post-viewer"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 8))
        capture(app, name: "userflow-ar-post-created-and-viewed-in-ar")
        app.buttons["Kapat"].tap()
    }

    func testUserFlowCloseReopenAndRelocalizeMultipleCycles() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
        app.launch()

        for cycle in 1...2 {
            let tabs = app.tabBars.firstMatch
            XCTAssertTrue(tabs.waitForExistence(timeout: 8), "\(cycle). döngüde sekmeler açılmadı.")
            tabs.buttons["AR"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 8))

            let nearbyPost = app.buttons["ar-nearby-post-33333333-3333-3333-3333-333333333333"]
            XCTAssertTrue(nearbyPost.waitForExistence(timeout: 12), "\(cycle). döngüde AR postu bulunamadı.")
            nearbyPost.tap()

            XCTAssertTrue(app.otherElements["ar-post-viewer"].waitForExistence(timeout: 10), "\(cycle). döngüde AR görüntüleyici açılmadı.")
            XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 8))
            capture(app, name: "userflow-reopen-cycle-\(cycle)")
            app.buttons["Kapat"].tap()

            // Close app and relaunch for next cycle
            app.terminate()
            app.launch()
        }
    }

}
