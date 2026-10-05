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

    func testUserFlowCreateYouTubePostAndViewIt() {
        let app = XCUIApplication()
        let videoURL = "https://youtu.be/dQw4w9WgXcQ"
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = videoURL
        app.launch()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8))
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 5))
        app.buttons["external-platform-youtube"].tap()

        XCTAssertTrue(app.buttons["external-import-complete"].waitForExistence(timeout: 5))
        app.buttons["external-import-complete"].tap()

        XCTAssertTrue(app.staticTexts["YouTube paylaşımı hazır"].waitForExistence(timeout: 5))
        let linkField = app.textFields["create-external-media"]
        XCTAssertTrue(linkField.waitForExistence(timeout: 5))
        XCTAssertEqual(linkField.value as? String, videoURL)

        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText("Harika YouTube Videosu")
        let kbDone2 = app.buttons["keyboard-done-button"]
        if kbDone2.waitForExistence(timeout: 1) { kbDone2.tap() }

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        publishButton.tap()

        let alert = app.alerts["LociAR"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        alert.buttons["Tamam"].tap()
        capture(app, name: "userflow-youtube-published")
    }

    func testUserFlowCreateSpotifyPostAndViewIt() {
        let app = XCUIApplication()
        let trackURL = "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = trackURL
        app.launch()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8))
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 5))
        app.buttons["external-platform-spotify"].tap()

        XCTAssertTrue(app.buttons["external-import-complete"].waitForExistence(timeout: 5))
        app.buttons["external-import-complete"].tap()

        XCTAssertTrue(app.staticTexts["Spotify paylaşımı hazır"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["external-media-selection-preview"].waitForExistence(timeout: 5))
        let linkField = app.textFields["create-external-media"]
        XCTAssertTrue(linkField.waitForExistence(timeout: 5))
        XCTAssertEqual(linkField.value as? String, trackURL)

        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText("Favori Spotify Şarkım")
        let kbDone3 = app.buttons["keyboard-done-button"]
        if kbDone3.waitForExistence(timeout: 1) { kbDone3.tap() }

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        publishButton.tap()

        let alert = app.alerts["LociAR"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        alert.buttons["Tamam"].tap()
        capture(app, name: "userflow-spotify-published")
    }
}
