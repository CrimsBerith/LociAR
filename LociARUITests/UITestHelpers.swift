import UIKit
import XCTest

/// Shared helpers for the AuthGateUITests suites.
extension AuthGateUITests {
    func resolveLocationOrCameraPromptIfPresent() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 1) else { return }
        let prompt = ([alert.label] + alert.staticTexts.allElementsBoundByIndex.map(\.label))
            .joined(separator: " ").lowercased()
        guard prompt.contains("location") || prompt.contains("konum")
                || prompt.contains("camera") || prompt.contains("kamera") else { return }
        for title in [
            "İzin Ver", "Allow", "Uygulamayı Kullanırken İzin Ver", "Allow While Using App",
            "Bir Kez İzin Ver", "Allow Once"
        ] {
            let button = alert.buttons[title]
            if button.exists {
                button.tap()
                return
            }
        }
    }

    func identifiedControl(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let query = app.descendants(matching: .any)[identifier]
        return query
    }

    func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 8) {
        for _ in 0..<maxSwipes {
            if element.exists && element.isHittable,
               element.frame.midY >= app.frame.minY + 100,
               element.frame.midY <= app.frame.maxY - 90 { return }
            // Full-screen flings can skip a short row entirely on an iPhone SE.
            // Use bounded drags and recover upward if the row has passed the viewport.
            let above = element.exists && element.frame.maxY > 0 && element.frame.maxY < app.frame.minY + 100
            // Use the form inner gutter (0.22) so it remains inside the form across all screen widths.
            let hasKb = app.keyboards.element.exists
            let bottomY = hasKb ? 0.40 : 0.72
            let topY = hasKb ? 0.18 : 0.42
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: above ? topY : bottomY))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: above ? bottomY : topY))
            start.press(forDuration: 0.05, thenDragTo: end)
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
        guard app.navigationBars["Not"].waitForExistence(timeout: 8) else {
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
        if !app.navigationBars["Not"].waitForExistence(timeout: 8) {
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
        if app.navigationBars["Not"].exists {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        if app.tabBars.buttons["Harita"].exists {
            app.tabBars.buttons["Harita"].tap()
        }
        if app.buttons["map-clear-selection"].exists {
            app.buttons["map-clear-selection"].tap()
        }
    }

    /// Closes the software keyboard and verifies that it is gone. The first strategy is the form's
    /// own "Bitti" toolbar button; later attempts fall back to the interactive scroll dismissal and
    /// to taps outside the input, because a single tap on the navigation bar is not reliable on a
    /// physical iPhone or a small simulator.
    func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.element.exists else { return }
        for attempt in 0..<3 {
            let done = app.buttons["keyboard-done-button"].exists ? app.buttons["keyboard-done-button"] : app.buttons["Bitti"]
            if done.exists && done.isHittable {
                done.tap()
            } else if attempt == 1 {
                // Forms use `.scrollDismissesKeyboard(.interactively)`: a short drag towards the keyboard closes it.
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.30))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
                start.press(forDuration: 0.05, thenDragTo: end)
            } else if app.navigationBars["Konum notu bırak"].exists {
                app.navigationBars["Konum notu bırak"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            } else if app.navigationBars["İçerik oluştur"].exists {
                app.navigationBars["İçerik oluştur"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            } else if app.buttons["create-publish"].exists {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
            } else {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.18)).tap()
            }
            if app.keyboards.firstMatch.waitForNonExistence(timeout: 2) { break }
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
    }

    /// `XCUIElement` exposes keyboard focus only through key-value coding.
    func hasKeyboardFocus(_ element: XCUIElement) -> Bool {
        element.exists && ((element.value(forKey: "hasKeyboardFocus") as? Bool) ?? false)
    }

    func waitForKeyboardFocus(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if hasKeyboardFocus(element) { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return hasKeyboardFocus(element)
    }

    /// iOS offers a strong password for `.newPassword` fields on a signed-in device. The sheet covers
    /// the form and steals focus from the next field, so the sweep chooses its own password.
    func dismissStrongPasswordSuggestionIfPresent(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let ownPassword = NSPredicate(
            format: "label BEGINSWITH %@ OR label BEGINSWITH %@ OR label BEGINSWITH[c] %@ OR label == %@ OR label == %@",
            "Kendi ", "Choose My Own", "Başka Seçenek", "Not Now", "Şimdi Değil"
        )
        for host in [app, springboard] {
            let button = host.buttons.matching(ownPassword).firstMatch
            if button.exists, button.isHittable {
                button.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.3))
                return
            }
        }
    }

    /// Gives `field` keyboard focus before typing. On a physical iPhone a plain `tap()` can land while
    /// the keyboard, an autofill bar or the strong-password sheet covers the field; `typeText` then
    /// aborts the whole test with "Neither element nor any descendant has keyboard focus".
    /// Returns `false` instead of typing when focus could not be obtained.
    @discardableResult
    func focusAndType(_ field: XCUIElement, _ text: String, in app: XCUIApplication, attempts: Int = 3) -> Bool {
        guard field.waitForExistence(timeout: 3) else { return false }
        for attempt in 0..<attempts {
            dismissStrongPasswordSuggestionIfPresent(app)
            if !hasKeyboardFocus(field) {
                scrollUntilHittable(field, in: app, maxSwipes: 4)
                if field.isHittable {
                    field.tap()
                } else {
                    field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                }
                dismissStrongPasswordSuggestionIfPresent(app)
            }
            if waitForKeyboardFocus(field, timeout: 2) {
                field.typeText(text)
                return true
            }
            if attempt == 0, app.keyboards.element.exists {
                // The previous field is still focused: its Return key (`submitLabel(.next)`) moves focus forward.
                app.typeText(XCUIKeyboardKey.return.rawValue)
            }
        }
        return false
    }

    /// The Debug-only AR diagnostics disclosure starts collapsed on every AR screen, so
    /// `ar-mapping-diagnostic` does not exist until it is opened.
    @discardableResult
    func revealMappingDiagnostics(_ app: XCUIApplication, timeout: TimeInterval = 5) -> Bool {
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        if diagnostic.exists { return true }
        let identified = app.buttons["ar-mapping-diagnostic-toggle"]
        let toggle = identified.exists ? identified : app.buttons["Tanılama"]
        guard toggle.waitForExistence(timeout: timeout) else { return false }
        if toggle.isHittable {
            toggle.tap()
        } else {
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        return diagnostic.waitForExistence(timeout: timeout)
    }

    /// Current mapping diagnostic text for failure messages; never raises on a missing element.
    func mappingDiagnosticText(_ app: XCUIApplication) -> String {
        revealMappingDiagnostics(app, timeout: 2)
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        return diagnostic.exists ? diagnostic.label : "(tanı yok)"
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
            format: "label == %@ OR label == %@",
            "Kesin yüzey hazır", "Gerçek yüzey hazır"
        )).firstMatch
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        revealMappingDiagnostics(app)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !diagnostic.exists { revealMappingDiagnostics(app, timeout: 1) }
            let mapping = diagnostic.exists ? diagnostic.label : ""
            let trackingOK = mapping.contains("Takip normal")
                || mapping.contains("Harita hazır")
                || mapping.contains("Harita genişliyor")
            if exactSurface.exists, trackingOK { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    func waitForPersistablePhysicalSurface(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let exactSurface = app.staticTexts.matching(NSPredicate(
            format: "label == %@ OR label == %@",
            "Kesin yüzey hazır", "Gerçek yüzey hazır"
        )).firstMatch
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        revealMappingDiagnostics(app)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !diagnostic.exists { revealMappingDiagnostics(app, timeout: 1) }
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
