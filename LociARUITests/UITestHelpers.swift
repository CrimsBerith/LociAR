import UIKit
import XCTest

/// Shared helpers for the AuthGateUITests suites.
extension AuthGateUITests {
    func identifiedControl(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let query = app.descendants(matching: .any)[identifier]
        return query
    }

    func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 4) {
        for _ in 0..<maxSwipes {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
    }

    func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func addPrivacyAlertMonitor() {
        addUIInterruptionMonitor(withDescription: "Kamera ve konum izinleri") { alert in
            for title in [
                "İzin Ver", "Allow", "Uygulamayı Kullanırken İzin Ver", "Allow While Using App",
                "Bir Kez İzin Ver", "Allow Once"
            ] {
                let button = alert.buttons[title]
                if button.exists {
                    button.tap()
                    return true
                }
            }
            return false
        }
    }

    @discardableResult
    func publishPhysicalPost(
        _ app: XCUIApplication,
        caption: String
    ) -> Bool {
        recoverToMap(app)
        guard app.buttons["map-create"].waitForExistence(timeout: 8) else {
            XCTFail("Harita oluşturma düğmesi yok: \(caption)")
            return false
        }
        app.buttons["map-create"].tap()
        app.tap()
        guard app.navigationBars["Yüzey seç"].waitForExistence(timeout: 8) else {
            capture(app, name: "no-placement-\(caption)")
            XCTFail("Yüzey seçimi açılmadı: \(caption)")
            return false
        }
        guard waitForPhysicalSurfaceCandidate(app, timeout: 50) || recoverPhysicalSurface(app) else {
            capture(app, name: "no-surface-\(caption)")
            if app.buttons["Kapat"].exists { app.buttons["Kapat"].tap() }
            XCTFail("Düzlem bulunamadı: \(caption)")
            return false
        }
        guard lockPhysicalPlacement(app, caption: caption) else { return false }

        let captionField = app.textFields["create-caption"]
        guard captionField.waitForExistence(timeout: 5) else {
            XCTFail("Caption alanı yok: \(caption)")
            return false
        }
        captionField.tap()
        captionField.typeText(caption)
        dismissKeyboard(app)
        let publish = app.buttons["create-publish"]
        guard publish.waitForExistence(timeout: 5) else {
            XCTFail("Yayın düğmesi yok: \(caption)")
            return false
        }
        publish.tap()
        let alert = app.alerts["LociAR"]
        if !alert.waitForExistence(timeout: 4) {
            publish.tap()
        }
        guard alert.waitForExistence(timeout: 20) else {
            capture(app, name: "no-publish-alert-\(caption)")
            XCTFail("Yayın sonucu gelmedi: \(caption)")
            return false
        }
        alert.buttons["Tamam"].tap()
        guard app.buttons["map-create"].waitForExistence(timeout: 10) else {
            XCTFail("Haritaya dönülemedi: \(caption)")
            return false
        }
        return true
    }

    @discardableResult
    func openPublishedPostFromMapAndCapture(
        _ app: XCUIApplication,
        caption: String,
        shotName: String
    ) -> Bool {
        recoverToMap(app)
        guard app.tabBars.buttons["Harita"].waitForExistence(timeout: 5) else {
            XCTFail("Harita sekmesi yok: \(caption)")
            return false
        }
        app.tabBars.buttons["Harita"].tap()
        if app.buttons["map-clear-selection"].waitForExistence(timeout: 2) {
            app.buttons["map-clear-selection"].tap()
        }
        if app.buttons["map-refresh"].waitForExistence(timeout: 4) {
            app.buttons["map-refresh"].tap()
        }
        if app.buttons["map-clear-selection"].waitForExistence(timeout: 2) {
            app.buttons["map-clear-selection"].tap()
        }
        let mapRow = app.descendants(matching: .any)["map-open-\(caption)"]
        let captionLabel = app.staticTexts[caption]
        var appeared = mapRow.waitForExistence(timeout: 8) || captionLabel.waitForExistence(timeout: 4)
        if !appeared {
            for _ in 0..<10 {
                app.swipeUp()
                if mapRow.exists || captionLabel.exists {
                    appeared = true
                    break
                }
            }
        }
        guard appeared else {
            capture(app, name: "missing-map-\(shotName)")
            XCTFail("Post haritada görünmedi: \(caption) · list=\(mapRowDump(app))")
            return false
        }
        if mapRow.exists { mapRow.tap() } else { captionLabel.tap() }
        guard app.navigationBars["Post"].waitForExistence(timeout: 8) else {
            capture(app, name: "map-open-failed-\(shotName)")
            XCTFail("Post haritadan açılmadı: \(caption)")
            return false
        }
        capture(app, name: "map-\(shotName)")

        guard app.buttons["post-open-ar"].waitForExistence(timeout: 5) else {
            XCTFail("AR’da aç yok: \(caption)")
            return false
        }
        app.buttons["post-open-ar"].tap()
        guard app.buttons["Kapat"].waitForExistence(timeout: 10) else {
            capture(app, name: "no-ar-viewer-\(shotName)")
            XCTFail("AR görüntüleyici açılmadı: \(caption)")
            return false
        }
        _ = app.staticTexts["Yüzey bulundu. İçerik hazır."].waitForExistence(timeout: 25)
        capture(app, name: "map-ar-\(shotName)")
        app.buttons["Kapat"].tap()
        if !app.navigationBars["Post"].waitForExistence(timeout: 8) {
            recoverToMap(app)
            return true
        }
        app.navigationBars.buttons.element(boundBy: 0).tap()
        _ = app.buttons["map-create"].waitForExistence(timeout: 8)
        return true
    }

    @discardableResult
    func lockPhysicalPlacement(_ app: XCUIApplication, caption: String) -> Bool {
        let pin = app.buttons["create-pin-surface"]
        let found = app.staticTexts["Yüzey bulundu"]
        let usePlacement = app.buttons["Bu yerleşimi kullan"]
        let editor = app.navigationBars["İçerik oluştur"]

        for attempt in 1...2 {
            if !found.exists {
                guard pin.waitForExistence(timeout: 4) else {
                    capture(app, name: "no-pin-\(caption)")
                    XCTFail("Sabitleme düğmesi yok: \(caption)")
                    return false
                }
                pin.tap()
            }
            if !found.waitForExistence(timeout: 8) {
                if app.buttons["Tekrar tara"].exists { app.buttons["Tekrar tara"].tap() }
                _ = waitForPhysicalSurfaceCandidate(app, timeout: 20)
                continue
            }
            guard usePlacement.waitForExistence(timeout: 5) else { continue }
            let readyDeadline = Date().addingTimeInterval(40)
            while Date() < readyDeadline, !(usePlacement.exists && usePlacement.isEnabled) {
                RunLoop.current.run(until: Date().addingTimeInterval(0.25))
            }
            guard usePlacement.exists, usePlacement.isEnabled else { continue }
            usePlacement.tap()
            if editor.waitForExistence(timeout: 12) { return true }
            let alert = app.alerts["LociAR"]
            if alert.waitForExistence(timeout: 2) {
                alert.buttons["Tamam"].tap()
                if usePlacement.exists, usePlacement.isEnabled {
                    usePlacement.tap()
                    if editor.waitForExistence(timeout: 12) { return true }
                }
            }
            if attempt < 2, app.buttons["Tekrar tara"].exists {
                app.buttons["Tekrar tara"].tap()
                _ = waitForPhysicalSurfaceCandidate(app, timeout: 20)
            }
        }
        capture(app, name: "no-editor-\(caption)")
        XCTFail("Editör açılmadı: \(caption)")
        return false
    }

    func recoverPhysicalSurface(_ app: XCUIApplication) -> Bool {
        if app.buttons["Tekrar dene"].exists {
            app.buttons["Tekrar dene"].tap()
        } else if app.buttons["Tekrar tara"].exists {
            app.buttons["Tekrar tara"].tap()
        }
        return waitForPhysicalSurfaceCandidate(app, timeout: 35)
    }

    func recoverToMap(_ app: XCUIApplication) {
        if app.alerts["LociAR"].exists {
            app.alerts["LociAR"].buttons["Tamam"].tap()
        }
        if app.buttons["Vazgeç"].exists {
            app.buttons["Vazgeç"].tap()
        }
        if app.buttons["Kapat"].exists {
            app.buttons["Kapat"].tap()
        }
        if app.navigationBars["Post"].exists {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        if app.tabBars.buttons["Harita"].exists {
            app.tabBars.buttons["Harita"].tap()
        }
        if app.buttons["map-clear-selection"].exists {
            app.buttons["map-clear-selection"].tap()
        }
    }

    func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.element.exists else { return }
        if app.buttons["keyboard-done-button"].exists {
            app.buttons["keyboard-done-button"].tap()
        } else if app.navigationBars["İçerik oluştur"].exists {
            app.navigationBars["İçerik oluştur"].tap()
        } else if app.buttons["create-publish"].exists {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
    }

    func mapRowDump(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "map-open-"))
            .allElementsBoundByIndex
            .map(\.identifier)
            .joined(separator: ", ")
    }

    func waitForPhysicalSurfaceCandidate(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let exactSurface = app.staticTexts.matching(NSPredicate(
            format: "label == %@",
            "Kesin yüzey hazır"
        )).firstMatch
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let mapping = diagnostic.exists ? diagnostic.label : ""
            let trackingOK = mapping.contains("Takip normal")
                || mapping.contains("Harita hazır")
                || mapping.contains("Harita genişliyor")
            if exactSurface.exists, trackingOK { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return exactSurface.exists
    }

    func waitForPersistablePhysicalSurface(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let exactSurface = app.staticTexts.matching(NSPredicate(
            format: "label == %@",
            "Kesin yüzey hazır"
        )).firstMatch
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let mapping = diagnostic.exists ? diagnostic.label : ""
            let mappingReady = mapping.contains("Harita genişliyor") || mapping.contains("Harita hazır")
            if exactSurface.exists, mappingReady { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    func waitForHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND isEnabled == true AND isHittable == true"),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}
