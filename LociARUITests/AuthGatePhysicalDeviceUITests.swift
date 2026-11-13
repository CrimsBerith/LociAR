import UIKit
import XCTest

/// Physical-device suites (skipped on the simulator). Run with scripts/run-device-e2e*.command.
extension AuthGateUITests {
    /// Observes an actual remote message sent separately through the authorized admin UI.
    func testPhysicalAdminPushDeliveryAndTap() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek APNs teslimi için fiziksel iPhone gerekir.")
#else
        guard let title = ProcessInfo.processInfo.environment["E2E_LIVE_PUSH_TITLE"], !title.isEmpty else {
            throw XCTSkip("Canlı yönetici bildirimi gözlemi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        XCUIDevice.shared.press(.home)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[title].firstMatch
        print("[PHONE] Waiting for the explicitly requested remote admin notification")
        XCTAssertTrue(notification.waitForExistence(timeout: 90), "Gerçek yönetici bildirimi iOS'ta görülmedi.")
        let evidence = XCTAttachment(screenshot: notification.screenshot())
        evidence.name = "physical-remote-admin-notification"
        evidence.lifetime = .keepAlways
        add(evidence)
        notification.tap()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        XCTAssertTrue(app.navigationBars["Aktivite"].waitForExistence(timeout: 20), "Bildirim Aktivite ekranını açmalı.")
        capture(app, name: "physical-remote-admin-notification-opened")
#endif
    }

    /// Explicitly selected live-device setup; never changes consent during ordinary test runs.
    func testPhysicalEnableNotificationsForRequestedAdminTest() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek iPhone gerekir.")
#else
        guard ProcessInfo.processInfo.environment["E2E_ENABLE_PHYSICAL_NOTIFICATIONS"] == "1" else {
            throw XCTSkip("Canlı bildirim kurulumu açıkça seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        addUIInterruptionMonitor(withDescription: "İstenen bildirim testi izni") { alert in
            let text = alert.label.lowercased() + " " + alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ").lowercased()
            if text.contains("bildirim") || text.contains("notification") {
                for title in ["İzin Ver", "Allow"] where alert.buttons[title].exists {
                    alert.buttons[title].tap(); return true
                }
            }
            // APNs testing needs no new background location permission.
            for title in ["Yalnızca Kullanırken Koru", "Keep Only While Using", "İzin Verme", "Don't Allow"] where alert.buttons[title].exists {
                alert.buttons[title].tap(); return true
            }
            return false
        }
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20), "Telefonda gerçek hesap oturumu gerekli.")
        app.tabBars.buttons["Profil"].tap()
        let settings = app.buttons["profile-settings"]
        scrollUntilHittable(settings, in: app)
        settings.tap()
        app.buttons["settings-open-notifications"].tap()
        let notifications = app.switches["settings-notifications"]
        XCTAssertTrue(notifications.waitForExistence(timeout: 10))
        func waitForPreference(_ value: String) {
            let saved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@ AND enabled == true", value), object: notifications)
            XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 65), .completed, "Sunucu tercih işlemi tamamlanmalı.")
        }
        func acceptRequestedNotificationAlert() {
            let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
            guard alert.waitForExistence(timeout: 8) else { return }
            let text = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ").lowercased()
            guard text.contains("lociar"), text.contains("bildirim") || text.contains("notification") else { return }
            for title in ["İzin Ver", "Allow"] where alert.buttons[title].exists {
                alert.buttons[title].tap(); return
            }
        }
        // Re-enter the explicitly requested permission flow if a previous run stopped
        // after the server write but before iOS could display its permission dialog.
        if notifications.value as? String == "1" {
            notifications.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
            waitForPreference("0")
        }
        notifications.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        app.tap()
        waitForPreference("1")
        acceptRequestedNotificationAlert()
        // Trigger the interruption monitor after the asynchronous server round trip.
        app.tap()
        capture(app, name: "physical-live-notifications-enabled")
        let marketing = app.switches["settings-promotions"]
        XCTAssertEqual(marketing.value as? String, "0", "Pazarlama rızası ayrı kalmalı.")
        app.terminate()
        app.launch()
        acceptRequestedNotificationAlert()
        app.tabBars.buttons["Profil"].tap()
        scrollUntilHittable(settings, in: app)
        settings.tap()
        XCTAssertTrue(notifications.waitForExistence(timeout: 10))
        XCTAssertEqual(notifications.value as? String, "1", "Bildirim tercihi gerçek hesapta kalıcı olmalı.")
        capture(app, name: "physical-live-notifications-persisted")
#endif
    }

    func testPhysicalCurrentAccountNotificationState() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Fiziksel iPhone gerekir.")
#else
        let app = XCUIApplication()
        app.launch()
        capture(app, name: "physical-current-account-start")
        guard app.tabBars.firstMatch.waitForExistence(timeout: 15) else {
            XCTFail("Telefondaki canlı hesap giriş yapmış değil.")
            return
        }
        app.tabBars.buttons["Profil"].tap()
        capture(app, name: "physical-current-account-profile")
        let settings = app.buttons["profile-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 8))
        settings.tap()
        capture(app, name: "physical-current-notification-settings")
        for id in ["settings-notifications", "settings-promotions"] {
            let toggle = app.switches[id]
            print("[PHONE] \(id): \(toggle.exists ? String(describing: toggle.value) : "not-visible")")
        }
        let state = XCTAttachment(string: app.debugDescription)
        state.name = "physical-current-settings-state"
        state.lifetime = .keepAlways
        add(state)
#endif
    }

    func testPhysicalKlipySearchAndSelection() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı KLIPY testi fiziksel iPhone gerektirir.")
#else
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"]
        app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 15) else {
            throw XCTSkip("Canlı KLIPY testi için iPhone'da giriş yapılmış hesap gerekli.")
        }
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 10))
        scrollUntilHittable(app.buttons["create-gif-add"], in: app)
        app.buttons["create-gif-add"].tap()
        XCTAssertTrue(app.navigationBars["GIF seç"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["gif-attribution"].waitForExistence(timeout: 5))

        let results = app.buttons.matching(identifier: "gif-result")
        if !results.firstMatch.waitForExistence(timeout: 30), app.buttons["Tekrar dene"].exists {
            app.buttons["Tekrar dene"].tap()
        }
        let trendingLoaded = results.firstMatch.waitForExistence(timeout: 30)
        let notice = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "yüklenemiyor")).firstMatch
        let noticeText = notice.exists ? notice.label : "Uyarı metni yok."
        XCTAssertTrue(trendingLoaded, "KLIPY trend GIF'leri yüklenmedi: \(noticeText)")
        capture(app, name: "physical-klipy-trending")

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("cat")
        XCTAssertTrue(results.firstMatch.waitForExistence(timeout: 30), "KLIPY araması sonuç döndürmedi.")
        capture(app, name: "physical-klipy-search-results")

        results.firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any)["create-gif-preview"].waitForExistence(timeout: 15))
        capture(app, name: "physical-klipy-selected-preview")
#endif
    }

    func testPhysicalNormalAccountPublishesLocationNoteWithoutCamera() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek GPS ve fiziksel iPhone gerekir.")
#else
        guard let caption = ProcessInfo.processInfo.environment["E2E_TEST_NOTE_TEXT"], !caption.isEmpty else {
            throw XCTSkip("Konum notu yayın testi açıkça seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "Gerçek hesap oturumu gerekli.")
        app.tabBars.buttons["Harita"].tap()
        app.buttons["map-location-note"].tap()
        let field = app.descendants(matching: .any)["place-note-text"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        field.tap()
        field.typeText(caption)
        dismissKeyboard(app)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        XCTAssertFalse(app.buttons["ar-pin-surface"].exists)
        let measured = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Konum hazır · ±", "Konum hassaslaşıyor · ±"
        )).firstMatch
        XCTAssertTrue(measured.waitForExistence(timeout: 60), "Gerçek konum ölçümü alınamadı.")
        capture(app, name: "physical-camera-free-note-before-publish")
        app.buttons["place-note-publish"].tap()
        let success = app.staticTexts["Notun yayınlandı. Haritada görünüyor."]
        let manual = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "tekrar Burada yayınla")).firstMatch
        let deadline = Date().addingTimeInterval(90)
        while !success.exists && !manual.exists && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        if manual.exists {
            capture(app, name: "physical-camera-free-note-manual-pin")
            app.buttons["place-note-publish"].tap()
        }
        capture(app, name: "physical-camera-free-note-publish-result")
        XCTAssertTrue(success.waitForExistence(timeout: 65), "Konum notu sunucuda yayınlanamadı.")
        app.buttons["Kapat"].tap()
        app.buttons["map-refresh"].tap()
        let row = app.buttons["map-open-\(caption)"]
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Yayınlanan konum notu haritada kamera açmadan listelenmedi.")
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        capture(app, name: "physical-camera-free-note-on-map")
        row.tap()
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        capture(app, name: "physical-camera-free-note-opened")
#endif
    }

    func testPhysicalLocationNoteReceivesGPSWithoutCamera() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek GPS ölçümü fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.buttons["map-location-note"].waitForExistence(timeout: 10))
        app.buttons["map-location-note"].tap()
        app.tap() // Let XCTest handle a pending Core Location permission alert.
        XCTAssertTrue(app.navigationBars["Konum notu bırak"].waitForExistence(timeout: 10))
        let measured = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label BEGINSWITH %@",
            "Konum hazır · ±", "Konum hassaslaşıyor · ±"
        )).firstMatch
        guard measured.waitForExistence(timeout: 60) else {
            capture(app, name: "physical-gps-no-fix")
            XCTFail("Kamera açmadan gerçek GPS ölçümü alınamadı; konum izni ve açık alan koşullarını kontrol edin.")
            return
        }
        let first = XCTAttachment(string: measured.label)
        first.name = "physical-gps-first-accuracy"
        first.lifetime = .keepAlways
        add(first)
        capture(app, name: "physical-gps-without-camera")
        XCTAssertFalse(app.buttons["ar-pin-surface"].exists)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        XCTAssertFalse(app.buttons["place-note-publish"].isEnabled, "Boş not yayınlanmamalı.")

        XCUIDevice.shared.press(.home)
        RunLoop.current.run(until: Date().addingTimeInterval(10))
        app.activate()
        XCTAssertTrue(app.navigationBars["Konum notu bırak"].waitForExistence(timeout: 10))
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.buttons["map-location-note"].waitForExistence(timeout: 10))
        app.buttons["map-location-note"].tap()
        XCTAssertTrue(measured.waitForExistence(timeout: 60), "Arka plandan sonra yeni ölçüm oturumu konum alamadı.")
        let resumed = XCTAttachment(string: measured.label)
        resumed.name = "physical-gps-resumed-accuracy"
        resumed.lifetime = .keepAlways
        add(resumed)
        capture(app, name: "physical-gps-new-session-after-background")
        app.buttons["Kapat"].tap()
#endif
    }

    func testPhysicalNormalAccountARTabReceivesCameraFrame() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek hesap ve kamera durumu fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments += ["-arcore_disclosure_acknowledged_v1", "YES"]
        addPrivacyAlertMonitor()
        app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 8) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 15), "Normal hesap akışında AR kamerası açılmadı.")
        XCTAssertFalse(app.buttons["Kapat"].exists, "AR sekmesi postu kullanıcı seçmeden açmamalı.")
        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 20))
        capture(app, name: "physical-normal-account-new-pin")
#endif
    }

    func testPhysicalNormalAccountPublishesTextARPostAndDeletesIt() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı AR yayını ve sosyal akış doğrulaması fiziksel iPhone gerektirir.")
#else
        let caption = "Canlı AR metin \(UUID().uuidString.prefix(6))"
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_DISABLE_EXTERNAL_APP_LAUNCH", "-arcore_disclosure_acknowledged_v1", "YES"]
        addPrivacyAlertMonitor()
        app.launch()

        guard app.tabBars.firstMatch.waitForExistence(timeout: 10) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }
        app.tabBars.buttons["Paylaş"].tap()
        app.tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 20))
        guard waitForPersistablePhysicalSurface(app, timeout: 120) else {
            let diagnostic = mappingDiagnosticText(app)
            XCTFail(
                "Canlı yayın testi için kaydedilebilir gerçek yüzey hazırlanamadı; "
                    + "telefonu dokulu yüzey çevresinde gezdirin. Tanı: \(diagnostic)"
            )
            return
        }
        app.buttons["ar-pin-surface"].tap()
        XCTAssertTrue(app.buttons["ar-add-content"].waitForExistence(timeout: 12), "Fiziksel yüzey kilitlenmedi.")
        XCTAssertFalse(app.staticTexts["Yaklaşık yerleştirme · 0,8 m"].exists)
        let addContent = app.buttons["ar-add-content"]
        let mappingDeadline = Date().addingTimeInterval(90)
        while !addContent.isEnabled && Date() < mappingDeadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        guard addContent.isEnabled else {
            let diagnostic = mappingDiagnosticText(app)
            XCTFail("World-map kaydetme kalitesine ulaşılamadı; telefonu çevrede yavaşça gezdirin. Tanı: \(diagnostic)")
            return
        }
        XCUIDevice.shared.orientation = .portrait
        guard waitForHittable(addContent, timeout: 8) else {
            XCTFail("World-map hazırdı ancak İçerik ekle düğmesi dokunulabilir değildi.")
            return
        }
        addContent.tap()

        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 25), "World-map hazırlanamadı.")
        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText(caption)
        capture(app, name: "physical-live-text-editor")

        app.buttons["create-publish"].tap()
        let resultAlert = app.alerts["LociDrop"]
        XCTAssertTrue(resultAlert.waitForExistence(timeout: 45), "Canlı yayın sonucu gelmedi.")
        guard resultAlert.staticTexts["Post yayınlandı. Keşfet ve profilinde görünür."].exists else {
            let alertText = resultAlert.staticTexts.allElementsBoundByIndex
                .map(\.label)
                .filter { !$0.isEmpty && $0 != "LociDrop" }
                .joined(separator: " · ")
            capture(app, name: "physical-live-publish-rejected")
            XCTFail("Post aktif yayınlanmadı: \(alertText)")
            return
        }
        capture(app, name: "physical-live-publish-active")
        resultAlert.buttons["Tamam"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))

        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 8))
        let discoverPost = app.staticTexts[caption]
        XCTAssertTrue(discoverPost.waitForExistence(timeout: 15), "Aktif post Keşfet akışında görünmedi.")
        capture(app, name: "physical-live-post-discover")

        app.tabBars.buttons["AR"].tap()
        let nearbyPost = app.staticTexts[caption]
        XCTAssertTrue(nearbyPost.waitForExistence(timeout: 15), "Aktif post yakındaki AR listesinde görünmedi.")

        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.staticTexts["Notlarım"].waitForExistence(timeout: 8))
        app.staticTexts["Notlarım"].tap()
        XCTAssertTrue(app.navigationBars["Notlarım"].waitForExistence(timeout: 8))
        let ownPost = app.staticTexts[caption]
        XCTAssertTrue(ownPost.waitForExistence(timeout: 15), "Canlı post profil listesinde görünmedi.")
        ownPost.swipeLeft()
        XCTAssertTrue(app.buttons["Sil"].waitForExistence(timeout: 5))
        app.buttons["Sil"].tap()
        XCTAssertTrue(app.buttons["Postu sil"].waitForExistence(timeout: 5))
        app.buttons["Postu sil"].tap()
        XCTAssertFalse(ownPost.waitForExistence(timeout: 15), "Silinen post profil listesinden kalkmadı.")
        capture(app, name: "physical-live-post-deleted")
#endif
    }

    func testPhysicalRetriesExistingTextARDeadLetterAndDeletesIt() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı dead-letter kurtarma doğrulaması fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 10) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }

        app.tabBars.buttons["Profil"].tap()
        guard app.staticTexts["Notlarım"].waitForExistence(timeout: 8) else {
            throw XCTSkip("Normal hesap profilinde Postlarım açılamadı.")
        }
        app.staticTexts["Notlarım"].tap()
        XCTAssertTrue(app.navigationBars["Notlarım"].waitForExistence(timeout: 8))
        let retry = app.buttons["my-posts-retry-pending"]
        guard retry.waitForExistence(timeout: 8) else {
            throw XCTSkip("Yeniden gönderilecek dead-letter AR postu yok.")
        }
        let queuedPost = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@",
            "Canlı AR metin "
        )).firstMatch
        XCTAssertTrue(queuedPost.waitForExistence(timeout: 8), "Bekleyen metin AR postu listelenmedi.")
        let caption = queuedPost.label
        retry.tap()

        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 25), "Kurtarılan post Keşfet'te görünmedi.")
        capture(app, name: "physical-retried-text-post-discover")

        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 20), "Kurtarılan post AR listesinde görünmedi.")

        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.staticTexts["Notlarım"].waitForExistence(timeout: 8))
        app.staticTexts["Notlarım"].tap()
        XCTAssertTrue(app.navigationBars["Notlarım"].waitForExistence(timeout: 8))
        let ownPost = app.staticTexts[caption]
        XCTAssertTrue(ownPost.waitForExistence(timeout: 20), "Kurtarılan post Postlarım'da görünmedi.")
        ownPost.swipeLeft()
        XCTAssertTrue(app.buttons["Sil"].waitForExistence(timeout: 5))
        app.buttons["Sil"].tap()
        XCTAssertTrue(app.buttons["Postu sil"].waitForExistence(timeout: 5))
        app.buttons["Postu sil"].tap()
        XCTAssertFalse(ownPost.waitForExistence(timeout: 20), "Silinen kurtarma postu listeden kalkmadı.")
        capture(app, name: "physical-retried-text-post-deleted")
#endif
    }

    func testPhysicalARTabShowsLiveCameraInsteadOfBlackScreen() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı kamera önizlemesi fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 16))
        let darkNotice = app.descendants(matching: .any)["ar-dark-camera-notice"]
        let darkNoticeVisible = darkNotice.waitForExistence(timeout: 6)
        print("[CAMERA] AR dark-feed notice: \(darkNoticeVisible ? "visible" : "not visible")")
        capture(app, name: "physical-ar-camera-dark-feed-check")
        XCTAssertFalse(app.buttons["Start Over"].exists)
        XCTAssertFalse(app.buttons["Tracking"].exists)
        capture(app, name: "physical-ar-live-camera")

        let nearbyFixture = app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."]
        XCTAssertTrue(nearbyFixture.waitForExistence(timeout: 8))
        nearbyFixture.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 8))
        // The authenticated fixture is a local preview: the viewer scans for a real surface
        // ("Yüzey aranıyor" / "Kartı açmak için kamerayı…") or reveals the post approximately,
        // and only live posts show the GPS aim guidance. `CONTAINS[c]` keeps the match
        // case-insensitive ("kamerayı" vs "Kamerayı").
        let aimVisible = app.descendants(matching: .any)["ar-aim-guidance"].waitForExistence(timeout: 8)
            || app.staticTexts.matching(NSPredicate(
                format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ "
                    + "OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@",
                "Nokta atışı", "Sağa dön", "Sola dön", "Yön kilitleniyor", "Kamerayı",
                "Yüzey aranıyor", "Yüzey bulundu", "Yaklaşık görünüm", "Yön aranıyor"
            )).firstMatch.waitForExistence(timeout: 4)
        if !aimVisible { capture(app, name: "physical-ar-viewer-no-guidance") }
        XCTAssertTrue(aimVisible, "Listeden açılan post nişan veya yüzey yönlendirmesini göstermedi.")
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 16))
        XCTAssertFalse(app.buttons["Start Over"].exists)
        XCTAssertFalse(app.buttons["Tracking"].exists)
        capture(app, name: "physical-ar-camera-after-viewer-dismiss")

        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Kameradan canlı görüntü alınamadı. Tekrar deneyin."].exists)
        let diagnosticsButton = app.buttons["ar-mapping-diagnostic-toggle"]
        XCTAssertTrue(diagnosticsButton.waitForExistence(timeout: 5), "Camera diagnostics were not available.")
        diagnosticsButton.tap()
        let diagnostic = app.staticTexts["ar-mapping-diagnostic"]
        XCTAssertTrue(diagnostic.waitForExistence(timeout: 5), "Camera diagnostic summary did not open.")
        let diagnosticText = diagnostic.label.replacingOccurrences(of: "\n", with: " | ")
        let lumaToken = diagnosticText.components(separatedBy: "luma=").last ?? ""
        guard let luma = Int(lumaToken.prefix(while: { $0.isNumber })) else {
            XCTFail("Camera luma was unavailable: \(diagnosticText)")
            return
        }
        print("[CAMERA] AR diagnostics: \(diagnosticText)")
        print("[CAMERA] averageLuma=\(luma)/255; dark-feed threshold <=20 for 5 seconds")
        let cameraLog = XCTAttachment(string: "AR dark-feed notice visible: \(darkNoticeVisible)\n\(diagnosticText)")
        cameraLog.name = "physical-camera-black-screen-log"
        cameraLog.lifetime = .keepAlways
        add(cameraLog)
        capture(app, name: "physical-ar-new-pin")

        app.tabBars.buttons["Harita"].tap()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 5))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 16))
        XCTAssertTrue(nearbyFixture.waitForExistence(timeout: 8))
        capture(app, name: "physical-ar-list-after-tab-return")
#endif
    }

    func testPhysicalARTabsTenCyclesKeepCameraHealthy() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı AR session döngüsü fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))

        for cycle in 1...10 {
            app.tabBars.buttons["AR"].tap()
            XCTAssertTrue(
                app.staticTexts["Kamera açık"].waitForExistence(timeout: 16),
                "AR kamera \(cycle). döngüde açılmadı."
            )
            XCTAssertFalse(app.staticTexts["Kameradan canlı görüntü alınamadı. Tekrar deneyin."].exists)

            app.tabBars.buttons["Paylaş"].tap()
            XCTAssertTrue(
                app.buttons["ar-pin-surface"].waitForExistence(timeout: 12),
                "Paylaş kamerası \(cycle). döngüde açılmadı."
            )
            XCTAssertFalse(app.staticTexts["Kameradan canlı görüntü alınamadı. Tekrar deneyin."].exists)
        }
        capture(app, name: "physical-ar-share-ten-cycles")
#endif
    }

    func testPhysicalBackgroundForegroundAndRelaunchStayAlive() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("AR yaşam döngüsü fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 16))

        for cycle in 1...3 {
            XCUIDevice.shared.press(.home)
            RunLoop.current.run(until: Date().addingTimeInterval(1))
            app.activate()
            XCTAssertTrue(
                app.staticTexts["Kamera açık"].waitForExistence(timeout: 16),
                "AR kamera background/foreground \(cycle). döngüde dönemedi."
            )
        }

        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 16))
        capture(app, name: "physical-ar-background-foreground-relaunch")
#endif
    }

    func testPhysicalDeviceFindsAndLocksARealSurface() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek AR yüzey kilidi fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        addUIInterruptionMonitor(withDescription: "Kamera izni") { alert in
            for title in ["İzin Ver", "Allow", "Uygulamayı Kullanırken İzin Ver", "Allow While Using App"] {
                let button = alert.buttons[title]
                if button.exists {
                    button.tap()
                    return true
                }
            }
            return false
        }
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8))
        app.buttons["map-create"].tap()
        app.tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 8))
        XCTAssertTrue(
            waitForPhysicalSurfaceCandidate(app, timeout: 45),
            "Düzlem/mesh adayı bulunamadı; cihazı iyi aydınlatılmış dokulu bir yüzey üzerinde gezdirin."
        )
        XCTAssertFalse(app.staticTexts["Canlı kamera hazırlanıyor"].exists)
        XCTAssertTrue(app.buttons["create-pin-surface"].exists)
        app.buttons["create-pin-surface"].tap()
        XCTAssertTrue(app.staticTexts["Yüzey bulundu"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Yaklaşık yerleştirme"].exists)
#endif
    }

    func testPhysicalPinPublishesAndRelocalizesOnSameSurface() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("World-map kaydetme ve yeniden bulma fiziksel iPhone gerektirir.")
#else
        let caption = "Fiziksel pin \(UUID().uuidString.prefix(6))"
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
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

        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8))
        app.buttons["map-create"].tap()
        app.tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 8))
        guard waitForPhysicalSurfaceCandidate(app, timeout: 45) else {
            XCTFail("Düzlem bulunamadı; telefonu aynı dokulu yüzey üzerinde yavaşça gezdirin.")
            return
        }
        app.buttons["create-pin-surface"].tap()
        guard app.staticTexts["Yüzey bulundu"].waitForExistence(timeout: 10) else {
            XCTFail("Gerçek yüzey kilidi oluşturulamadı.")
            return
        }
        XCTAssertFalse(app.staticTexts["Yaklaşık yerleştirme"].exists)
        capture(app, name: "physical-pin-locked")

        let usePlacement = app.buttons["Bu yerleşimi kullan"]
        guard usePlacement.waitForExistence(timeout: 5) else {
            XCTFail("Fiziksel yerleşim onayı gösterilmedi.")
            return
        }
        let mapDeadline = Date().addingTimeInterval(120)
        var placementReady = false
        while Date() < mapDeadline {
            if usePlacement.exists, usePlacement.isEnabled {
                placementReady = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        guard placementReady, usePlacement.exists, usePlacement.isEnabled else {
            capture(app, name: "physical-pin-mapping-not-ready")
            let diagnostic = mappingDiagnosticText(app)
            XCTFail("Yüzey kilitli ama yerleşim onayı açılmadı. Tanı: \(diagnostic)")
            return
        }
        usePlacement.tap()
        guard app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 20) else {
            XCTFail("World-map kaydedilemedi; aynı çevreyi biraz daha tarayın.")
            return
        }
        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText(caption)
        dismissKeyboard(app)

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(waitForHittable(publishButton, timeout: 5), "Publish butonu erişilemez")
        publishButton.tap()

        let resultAlert = app.alerts["LociDrop"]
        XCTAssertTrue(resultAlert.waitForExistence(timeout: 35))
        XCTAssertTrue(resultAlert.staticTexts["Post cihaz test modunda saklandı. Canlı backend bağlandığında yayınlanabilir."].exists)
        resultAlert.buttons["Tamam"].tap()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8))

        app.tabBars.buttons["AR"].tap()
        let localPin = app.staticTexts[caption]
        XCTAssertTrue(localPin.waitForExistence(timeout: 12), "Yeni yerel pin AR listesinde görünmedi.")
        localPin.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 10))
        let resolvedLabel = app.staticTexts["Yüzey bulundu. İçerik hazır."]
        XCTAssertTrue(
            resolvedLabel.waitForExistence(timeout: 60),
            "Doğru kamera açısında post otomatik açılmadı."
        )
        XCTAssertFalse(app.buttons["Yüzeye bağla"].exists)
        XCTAssertFalse(app.buttons["Bu yüzeye bağla"].exists)
        XCTAssertTrue(app.staticTexts["Yüzey bulundu"].exists)
        XCTAssertFalse(app.staticTexts["Canlı kamera hazırlanıyor"].exists)
        capture(app, name: "physical-pin-relocalized")
#endif
    }

    func testPhysicalEveryPostTypePublishesOpensFromMapAndCaptures() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Her post türünün harita ve AR doğrulaması fiziksel iPhone gerektirir.")
#else
        continueAfterFailure = true
        let token = String(UUID().uuidString.prefix(4))
        // Posts are text only since 9 Oct 2026 (social media links removed).
        let textCases = ["Metin post \(token)", "İkinci metin post \(token)"]
        var published: [String] = []
        var failures: [String] = []

        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 10))

        for caption in textCases {
            if publishPhysicalPost(app, caption: caption) {
                published.append(caption)
            } else {
                failures.append("Yayınlanamadı: \(caption)")
                recoverToMap(app)
            }
            RunLoop.current.run(until: Date().addingTimeInterval(1.2))
        }

        app.terminate()
        app.launchArguments += ["UITEST_ATTACH_SAMPLE_IMAGE"]
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 10))
        let photoCaption = "Fotoğraf post \(token)"
        if publishPhysicalPost(app, caption: photoCaption) {
            published.append(photoCaption)
        } else {
            failures.append("Yayınlanamadı: \(photoCaption)")
            recoverToMap(app)
        }

        for (index, caption) in published.enumerated() {
            if index > 0, index % 3 == 0 {
                app.terminate()
                app.launch()
                XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 10))
            }
            if !openPublishedPostFromMapAndCapture(app, caption: caption, shotName: caption) {
                failures.append("Haritadan açılamadı: \(caption) · list=\(mapRowDump(app))")
                recoverToMap(app)
            }
        }

        if published.isEmpty {
            XCTFail("Hiçbir post yayınlanamadı.")
        }
        if !failures.isEmpty {
            XCTFail(failures.joined(separator: " | "))
        }
#endif
    }

    func testPhysicalLatestSavedPinRelocalizesOnSameSurface() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Kaydedilmiş world-map doğrulaması fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["AR"].waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.buttons["Yenile"].waitForExistence(timeout: 12))
        app.buttons["Yenile"].tap()
        let savedPin = app.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@", "Fiziksel pin "))
            .firstMatch
        guard savedPin.waitForExistence(timeout: 10) else {
            throw XCTSkip("Kayıtlı fiziksel pin yok; önce paylaşım testinin geçmesi gerekir.")
        }
        savedPin.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 10))
        let resolvedLabel = app.staticTexts["Yüzey bulundu. İçerik hazır."]
        XCTAssertTrue(
            resolvedLabel.waitForExistence(timeout: 60),
            "Doğru kamera açısında kayıtlı post otomatik açılmadı."
        )
        XCTAssertFalse(app.buttons["Yüzeye bağla"].exists)
        XCTAssertFalse(app.buttons["Bu yüzeye bağla"].exists)
        XCTAssertTrue(app.staticTexts["Yüzey bulundu"].exists)
        XCTAssertFalse(app.staticTexts["Canlı kamera hazırlanıyor"].exists)
        capture(app, name: "physical-saved-pin-relocalized")
#endif
    }

    func testPhysicalPaylasTabLocksARealSurface() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Paylaş yüzey kilidi fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_AUTHENTICATED")
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["Paylaş"].tap()
        app.tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 12))
        guard waitForPhysicalSurfaceCandidate(app, timeout: 45) else {
            capture(app, name: "physical-paylas-no-surface")
            let diagnostic = mappingDiagnosticText(app)
            XCTFail("Paylaş sekmesinde gerçek yüzey bulunamadı; nişangâhı tamamen dokulu zemin veya duvara yöneltin. Tanı: \(diagnostic)")
            return
        }
        app.buttons["ar-pin-surface"].tap()
        XCTAssertTrue(app.buttons["ar-add-content"].waitForExistence(timeout: 12), "Yüzey kilitlenmedi.")
        XCTAssertTrue(
            app.staticTexts["Yerleştirildi"].exists
                || app.staticTexts["Fiziksel yüzeye yerleştirildi"].exists
        )
        XCTAssertFalse(app.staticTexts["Yaklaşık yerleştirme · 0,8 m"].exists)
        capture(app, name: "physical-paylas-locked")
#endif
    }

    func testPhysicalDevicePostOpenCloseLifecycleAndInteractions() {
        let app = XCUIApplication()
        // Blocking is available only when viewing another member’s post.
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OTHER_USER"]
        app.launch()

        // 1. Keşfet: Open post, like, save, view profile, back, open AR, close AR, back to Discover
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["Keşfet"].tap()
        let samplePostText = "Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."
        let postRow = app.staticTexts[samplePostText]
        XCTAssertTrue(postRow.waitForExistence(timeout: 8), "Keşfet postu bulunamadı.")
        postRow.tap()

        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5), "Post detay ekranı açılmadı.")
        capture(app, name: "device-post-detail-open")

        // Like button toggle
        let likeButton = app.buttons["post-like-button"]
        if likeButton.waitForExistence(timeout: 4) {
            likeButton.tap()
            _ = app.staticTexts["Beğenildi"].waitForExistence(timeout: 3)
        }

        // Save button toggle
        let saveButton = app.buttons["post-save-button"]
        if saveButton.waitForExistence(timeout: 4) {
            saveButton.tap()
            _ = app.staticTexts["Kaydedildi"].waitForExistence(timeout: 3)
        }

        // Open creator profile & back
        let profileLink = app.buttons["post-open-profile"]
        XCTAssertTrue(profileLink.waitForExistence(timeout: 5))
        profileLink.tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))

        // Open 3-dots more menu
        let moreMenu = app.buttons["post-more-menu"]
        if moreMenu.waitForExistence(timeout: 4) {
            moreMenu.tap()
            XCTAssertTrue(app.buttons["post-block-user"].waitForExistence(timeout: 3))
            // Dismiss menu by tapping navigation bar
            app.navigationBars["Not"].tap()
        }

        // Open AR viewer & close
        let openARButton = app.buttons["post-open-ar"]
        XCTAssertTrue(openARButton.waitForExistence(timeout: 5))
        openARButton.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 10), "AR görüntüleyici açılmadı.")
        capture(app, name: "device-post-ar-viewer")
        app.buttons["Kapat"].tap()

        // Verify back in Post detail
        XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 8))

        // Back to Discover
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 5))

        // 2. Harita: Open post & close
        app.tabBars.buttons["Harita"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-map"].waitForExistence(timeout: 8))
        let mapPost = app.descendants(matching: .any)["map-open-\(samplePostText)"]
        if mapPost.waitForExistence(timeout: 6) {
            mapPost.tap()
            XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 5))
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Harita"].waitForExistence(timeout: 5))
        }

        // 3. AR Tab: Open nearby post & close
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 8))
        let nearbyPost = app.buttons["ar-nearby-post-33333333-3333-3333-3333-333333333333"]
        if nearbyPost.waitForExistence(timeout: 8) {
            nearbyPost.tap()
            XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 8))
            app.buttons["Kapat"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["screen-ar"].waitForExistence(timeout: 8))
        }
        capture(app, name: "device-post-open-close-completed")
    }

    func testPhysicalDevicePostPinFlows() {
        let app = XCUIApplication()
        app.launchArguments = ["UITEST_AUTHENTICATED"]
        app.launch()

        // Go to Harita tab
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["Harita"].tap()

        // 1. Open create flow and test dismiss (Kapat)
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8))
        app.buttons["map-create"].tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 8))
        capture(app, name: "device-pin-surface-scanner")

        // Dismiss sheet
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 6))

        // 2. Re-open and pin approximate
        app.buttons["map-create"].tap()
        XCTAssertTrue(app.navigationBars["Yüzey seç"].waitForExistence(timeout: 8))

        let approxButton = app.buttons["create-place-approximate"]
        XCTAssertTrue(approxButton.waitForExistence(timeout: 6), "Önüme yerleştir butonu bulunamadı.")
        // The button stays disabled until the AR session scans with a live camera frame; a tap
        // before that is refused by the engine and the sheet stays on "Yüzey seç".
        XCTAssertTrue(waitForHittable(approxButton, timeout: 20), "Yaklaşık yerleştirme kamera hazır olmadan etkinleşmedi. Tanı: \(mappingDiagnosticText(app))")
        approxButton.tap()

        // Transitions to "İçerik oluştur"
        guard app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8) else {
            capture(app, name: "device-pin-approximate-not-transitioned")
            XCTFail("İçerik oluştur ekranına geçilemedi. Tanı: \(mappingDiagnosticText(app))")
            return
        }
        capture(app, name: "device-pinned-editor-ready")

        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        XCTAssertTrue(focusAndType(captionField, "iPhone Fiziksel Pin Testi", in: app), "Başlık alanı klavye odağı alamadı.")
        dismissKeyboard(app)

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        XCTAssertTrue(waitForHittable(publishButton, timeout: 5), "Publish butonu erişilemez")
        publishButton.tap()

        let alert = app.alerts["LociDrop"]
        XCTAssertTrue(alert.waitForExistence(timeout: 25), "Yayın alert'ı açılmadı.")
        alert.buttons["Tamam"].tap()

        // Returned to Map cleanly
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 8), "Yayın sonrasında haritaya dönülemedi.")
        capture(app, name: "device-pin-publish-completed")
    }

    func testPhysicalCaptureAllSevenWallPostTypes() {
        struct WallItem {
            let key: String
            let name: String
            let isSocial: Bool
            let isPhoto: Bool
            let url: String?
            let caption: String
        }

        let items: [WallItem] = [
            WallItem(key: "text", name: "Metin", isSocial: false, isPhoto: false, url: nil, caption: "Bu tarihi taş duvar, mahallenin hafızasını taşıyor."),
            WallItem(key: "photo", name: "Fotoğraf", isSocial: false, isPhoto: true, url: nil, caption: "Tarihi taş duvarın özel anı fotoğrafı.")
        ]

        for item in items {
            // 1. Editor verification & capture (Anchored to Vertical Wall)
            let editorApp = XCUIApplication()
            var editorArgs = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"]
            if item.isPhoto {
                editorArgs.append("UITEST_ATTACH_SAMPLE_IMAGE")
            }
            editorApp.launchArguments = editorArgs
            editorApp.launch()

            XCTAssertTrue(editorApp.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8))
            XCTAssertTrue(editorApp.staticTexts["Dikey yüzey hazır"].waitForExistence(timeout: 5))

            let captionField = editorApp.textFields["create-caption"]
            XCTAssertTrue(captionField.waitForExistence(timeout: 5))
            captionField.tap()
            captionField.typeText(item.caption)

            if editorApp.buttons["keyboard-done-button"].waitForExistence(timeout: 2) {
                editorApp.buttons["keyboard-done-button"].tap()
            } else {
                dismissKeyboard(editorApp)
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))

            capture(editorApp, name: "wall-editor-\(item.key)")

            let publishButton = editorApp.buttons["create-publish"]
            XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
            publishButton.tap()

            let alert = editorApp.alerts["LociDrop"]
            XCTAssertTrue(alert.waitForExistence(timeout: 10))
            alert.buttons["Tamam"].tap()

            editorApp.terminate()

            // 2. Post detail card & AR viewer capture (Spatial on Vertical Wall)
            let postApp = XCUIApplication()
            postApp.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY", "UITEST_WALL_AR_PREVIEW"]
            postApp.launchEnvironment["UITEST_FIXTURE_PLATFORM"] = item.key
            postApp.launch()

            XCTAssertTrue(postApp.navigationBars["Not"].waitForExistence(timeout: 8))
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
            capture(postApp, name: "wall-detail-\(item.key)")

            let openARButton = postApp.buttons["post-open-ar"]
            if openARButton.waitForExistence(timeout: 5) {
                openARButton.tap()
                XCTAssertTrue(postApp.buttons["Kapat"].waitForExistence(timeout: 10))
                RunLoop.current.run(until: Date().addingTimeInterval(2.5))
                capture(postApp, name: "wall-ar-\(item.key)")
                postApp.buttons["Kapat"].tap()
            }
            postApp.terminate()
        }
    }

    /// Master comprehensive UI automation: systematically visits every screen, button,
    /// modal, alert, feedback, and settings page on the connected physical iPhone.
    func testMasterCaptureAllScreensAndActionsOnDevice() throws {
        continueAfterFailure = true

        // -------------------------------------------------------------
        // BÖLÜM 1: Onboarding (Karşılama Adımları)
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["-hasCompletedOnboarding", "NO"]
            app.launch()
            if app.buttons["onboarding-next"].waitForExistence(timeout: 8) {
                capture(app, name: "01_Onboarding_Adim1_Mekan_Notlari")
                app.buttons["onboarding-next"].tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "02_Onboarding_Adim2_Yakinindaki_Notlar")
                app.buttons["onboarding-next"].tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "03_Onboarding_Adim3_Gizlilik_Topluluk")
                if app.buttons["onboarding-finish"].waitForExistence(timeout: 4) {
                    app.buttons["onboarding-finish"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                    capture(app, name: "04_Onboarding_Tamamlandi_Gecis")
                }
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 2: Giriş ve Kayıt (Auth Gate & Formlar & Şifremi Unuttum)
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_SIGNED_OUT"]
            app.launch()
            if app.textFields["auth-email-field"].waitForExistence(timeout: 10) {
                capture(app, name: "05_Auth_Giris_Yap_Ana_Ekran")

                // Kayıt Ol Sekmesine Geçiş
                if app.buttons["auth-mode-signup"].waitForExistence(timeout: 4) {
                    app.buttons["auth-mode-signup"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                    capture(app, name: "06_Auth_Kayit_Ol_Formu")

                    // `typeText` without keyboard focus aborts the whole sweep, so every field is
                    // focused first and a field that cannot be focused is recorded, not typed into.
                    for (identifier, query, text) in [
                        ("auth-email-field", app.textFields, "kagan@lociar.test"),
                        ("auth-password-field", app.secureTextFields, "Sifre1234!"),
                        ("auth-confirm-password-field", app.secureTextFields, "Sifre1234!")
                    ] {
                        let field = query[identifier].firstMatch
                        guard field.exists else { continue }
                        if !focusAndType(field, text, in: app) {
                            capture(app, name: "07_Auth_Kayit_Ol_Odak_Alinamadi_\(identifier)")
                            XCTFail("Kayıt formunda \(identifier) alanı klavye odağı alamadı.")
                        }
                    }
                    dismissKeyboard(app)
                    capture(app, name: "07_Auth_Kayit_Ol_Form_Dolduruldu")

                    // Şartlar onay kutusu toggle
                    if app.buttons["auth-terms-consent"].exists {
                        app.buttons["auth-terms-consent"].tap()
                        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
                        capture(app, name: "08_Auth_Kullanim_Kosullari_Onaylandi")
                    }

                    // Geri Giriş Yap Sekmesine Dönüş
                    if app.buttons["auth-mode-signin"].waitForExistence(timeout: 4) {
                        app.buttons["auth-mode-signin"].tap()
                        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
                        capture(app, name: "09_Auth_Giris_Yap_Sekmesine_Donus")
                    }
                }

                // Şifremi Unuttum Formu
                if app.buttons["auth-forgot-password"].waitForExistence(timeout: 4) {
                    app.buttons["auth-forgot-password"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                    capture(app, name: "10_Auth_Sifremi_Unuttum_Sheet")
                    if app.textFields.firstMatch.waitForExistence(timeout: 3),
                       focusAndType(app.textFields.firstMatch, "kagan@lociar.test", in: app) {
                        capture(app, name: "11_Auth_Sifremi_Unuttum_Eposta_Yazildi")
                    }
                    if app.buttons["Kapat"].exists {
                        app.buttons["Kapat"].tap()
                        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
                        capture(app, name: "12_Auth_Sifremi_Unuttum_Kapatildi")
                    }
                }
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 3: Harita (Map) - Filtreler, Odaklanma ve Konum Notu
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))

            // Harita Tabına Geçiş
            app.tabBars.buttons["Harita"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            capture(app, name: "13_Harita_Ana_Gorunum_Pinlerle")

            // Filtre 1: AR Notları
            let filterAR = app.buttons["🥽 AR Notları"]
            if filterAR.waitForExistence(timeout: 4) {
                filterAR.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "14_Harita_Filtre_AR_Notlari_Secildi")
            }

            // Filtre 2: Konum Notları
            let filterLoc = app.buttons["📍 Konum Notları"]
            if filterLoc.waitForExistence(timeout: 4) {
                filterLoc.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "15_Harita_Filtre_Konum_Notlari_Secildi")
            }

            // Filtre 3: Tümü
            let filterAll = app.buttons["Tümü"]
            if filterAll.waitForExistence(timeout: 4) {
                filterAll.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "16_Harita_Filtre_Tumu_Geri_Donuldu")
            }

            // Konumuma Odaklan
            let recenterBtn = app.buttons["map-recenter"]
            if recenterBtn.waitForExistence(timeout: 3) {
                recenterBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "17_Harita_Konumuma_Odaklan_Tiklandi")
            }

            // Konum Notu Bırak Modal
            let locNoteBtn = app.buttons["map-location-note"]
            if locNoteBtn.waitForExistence(timeout: 4) {
                locNoteBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "18_Harita_Konum_Notu_Birak_Modal")

                let textField = identifiedControl(app, "place-note-text")
                if textField.waitForExistence(timeout: 3),
                   focusAndType(textField, "Galata Kulesi önünde tarihi bir anı.", in: app) {
                    RunLoop.current.run(until: Date().addingTimeInterval(0.4))
                    capture(app, name: "19_Harita_Konum_Notu_Metin_Yazildi")
                    dismissKeyboard(app)
                    capture(app, name: "20_Harita_Konum_Notu_Hazir_Durum")
                }

                if app.buttons["Kapat"].exists {
                    app.buttons["Kapat"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                    capture(app, name: "21_Harita_Konum_Notu_Modal_Kapatildi")
                }
            }

            // Haritadan AR Yüzey Seçimi Modal (map-create)
            let mapCreateBtn = app.buttons["map-create"]
            if mapCreateBtn.waitForExistence(timeout: 4) {
                mapCreateBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "22_Harita_AR_Yuzey_Secimi_Sheet")
                if app.buttons["Kapat"].exists {
                    app.buttons["Kapat"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                    capture(app, name: "23_Harita_AR_Yuzey_Sheet_Kapatildi")
                }
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 4: AR Tab (Kamera, Radar ve HUD)
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["AR"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.5))
            capture(app, name: "24_AR_Canli_Kamera_ve_HUD_Ekrani")
            RunLoop.current.run(until: Date().addingTimeInterval(2.0))
            capture(app, name: "25_AR_Kamera_Radar_ve_Durum_Gostergesi")
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 5: Paylaş Tab & Editör & GIF & Ayarlar
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["Paylaş"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.5))
            capture(app, name: "26_Paylas_AR_Yuzey_Tarama_Reticle")
            app.terminate()
        }

        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"]
            app.launch()
            XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 10))
            capture(app, name: "27_Paylas_Icerik_Olusturma_Editoru")

            let captionField = app.textFields["create-caption"].firstMatch
            if captionField.exists, focusAndType(captionField, "Boğaz manzarası eşliğinde ilk AR notum.", in: app) {
                dismissKeyboard(app)
                capture(app, name: "28_Paylas_Editor_Metin_Yazildi")
            }

            let gifBtn = app.buttons["create-gif-add"].exists ? app.buttons["create-gif-add"] : app.buttons["GIF ekle"]
            scrollUntilHittable(gifBtn, in: app, maxSwipes: 4)
            if gifBtn.exists {
                gifBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(1.0))
                capture(app, name: "29_Paylas_KLIPY_Secici_Modal")

                if app.searchFields.firstMatch.waitForExistence(timeout: 3),
                   focusAndType(app.searchFields.firstMatch, "Istanbul", in: app) {
                    RunLoop.current.run(until: Date().addingTimeInterval(1.0))
                    capture(app, name: "30_Paylas_KLIPY_Arama_Sonuclari")
                }

                if app.buttons["Kapat"].exists {
                    app.buttons["Kapat"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                    capture(app, name: "31_Paylas_KLIPY_Kapatildi_Editore_Donus")
                }
            }

            if app.buttons["Kapat"].exists {
                app.buttons["Kapat"].tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                capture(app, name: "32_Paylas_Editor_Kapatildi")
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 6: Keşfet (Discover) ve Gönderi Detayı & Etkileşimler
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["Keşfet"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            capture(app, name: "33_Kesfet_Akisi_Ana_Ekran")

            app.swipeUp()
            RunLoop.current.run(until: Date().addingTimeInterval(0.6))
            capture(app, name: "34_Kesfet_Akisi_Kaydirilmis_Liste")
            app.terminate()
        }

        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OTHER_USER", "UITEST_OPEN_POST_DIRECTLY"]
            app.launch()
            XCTAssertTrue(app.navigationBars["Not"].waitForExistence(timeout: 10))
            capture(app, name: "35_Gonderi_Detay_Ekrani")

            let likeBtn = app.buttons["post-like-button"]
            if likeBtn.waitForExistence(timeout: 4) {
                likeBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                capture(app, name: "36_Gonderi_Begenildi_Geri_Bildirimi")
            }

            let bookmarkBtn = app.buttons["post-bookmark-button"]
            if bookmarkBtn.waitForExistence(timeout: 4) {
                bookmarkBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                capture(app, name: "37_Gonderi_Kaydedildi_Geri_Bildirimi")
            }

            let moreMenu = app.buttons["post-more-menu"]
            if moreMenu.waitForExistence(timeout: 4) {
                scrollUntilHittable(moreMenu, in: app, maxSwipes: 4)
                moreMenu.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "38_Gonderi_Daha_Fazla_Secenekler_Menusu")

                if app.buttons["post-add-to-collection"].waitForExistence(timeout: 3) {
                    app.buttons["post-add-to-collection"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                    capture(app, name: "39_Gonderi_Koleksiyona_Ekle_Sheet")
                    if app.buttons["Kapat"].exists { app.buttons["Kapat"].tap() }
                }
            }

            let reportBtn = app.buttons["post-report"]
            if reportBtn.waitForExistence(timeout: 4) {
                scrollUntilHittable(reportBtn, in: app, maxSwipes: 4)
                reportBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "40_Gonderi_Sikayet_Et_Nedenleri_Diyalogu")
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.70)).tap()
            }

            let openAR = app.buttons["post-open-ar"]
            if openAR.waitForExistence(timeout: 4) {
                openAR.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(2.0))
                capture(app, name: "41_Gonderi_AR_3D_Goruntuleyici_Ekrani")
                if app.buttons["Kapat"].exists {
                    app.buttons["Kapat"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.5))
                    capture(app, name: "42_Gonderi_AR_Goruntuleyici_Kapatildi")
                }
            }

            let authorProfile = app.buttons["post-open-profile"]
            if authorProfile.waitForExistence(timeout: 4) {
                scrollUntilHittable(authorProfile, in: app, maxSwipes: 4)
                authorProfile.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "43_Kullanici_Genel_Profili")

                let blockBtn = app.buttons["profile-block-user"]
                if blockBtn.waitForExistence(timeout: 4) {
                    scrollUntilHittable(blockBtn, in: app, maxSwipes: 4)
                    blockBtn.tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                    capture(app, name: "44_Kullanici_Engelle_Onay_Diyalogu")
                    if app.buttons["Vazgeç"].exists { app.buttons["Vazgeç"].tap() }
                }
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 7: Profil, Listeler ve Ayarlar
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["Profil"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(0.8))
            capture(app, name: "45_Profil_Ana_Ekrani")

            // Profili Düzenle
            let editProfileBtn = app.buttons["profile-edit-button"]
            if editProfileBtn.waitForExistence(timeout: 4) {
                editProfileBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "46_Profili_Duzenle_Ekrani")

                let editPhoto = app.buttons["profile-edit-photo"]
                if editPhoto.waitForExistence(timeout: 3) {
                    scrollUntilHittable(editPhoto, in: app, maxSwipes: 4)
                    capture(app, name: "47_Profili_Duzenle_Avatar_Secimi")
                }
                if app.buttons["Vazgeç"].exists { app.buttons["Vazgeç"].tap() }
            }

            // Aktivite Bildirimleri
            let activityRow = app.staticTexts["Aktivite"]
            if activityRow.waitForExistence(timeout: 4) {
                scrollUntilHittable(activityRow, in: app, maxSwipes: 6)
                activityRow.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "48_Profil_Aktivite_Bildirimleri_Ekrani")
                app.navigationBars.buttons.firstMatch.tap()
            }

            // Koleksiyonlar
            let colRow = app.staticTexts["Koleksiyonlar"]
            if colRow.waitForExistence(timeout: 4) {
                scrollUntilHittable(colRow, in: app, maxSwipes: 6)
                colRow.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "49_Profil_Koleksiyonlar_Listesi")

                if app.buttons["Yeni"].waitForExistence(timeout: 3) {
                    app.buttons["Yeni"].tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                    capture(app, name: "50_Profil_Yeni_Koleksiyon_Alert_Diyalogu")
                    if app.alerts.textFields.firstMatch.exists,
                       focusAndType(app.alerts.textFields.firstMatch, "İstanbul Gezi Rehberi", in: app) {
                        capture(app, name: "51_Profil_Yeni_Koleksiyon_Isim_Yazildi")
                        app.alerts.buttons["Oluştur"].tap()
                        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                        capture(app, name: "52_Profil_Koleksiyon_Olusturuldu_Listede")
                    } else if app.alerts.buttons["Vazgeç"].exists {
                        app.alerts.buttons["Vazgeç"].tap()
                    }
                }
                app.navigationBars.buttons.firstMatch.tap()
            }

            // Kaydedilenler
            let savedRow = app.staticTexts["Kaydedilenler"]
            if savedRow.waitForExistence(timeout: 4) {
                scrollUntilHittable(savedRow, in: app, maxSwipes: 6)
                savedRow.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "53_Profil_Kaydedilenler_Listesi")
                app.navigationBars.buttons.firstMatch.tap()
            }

            // Engellenenler
            let blockedRow = app.staticTexts["Engellenen hesaplar"]
            if blockedRow.waitForExistence(timeout: 4) {
                scrollUntilHittable(blockedRow, in: app, maxSwipes: 6)
                blockedRow.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "54_Profil_Engellenenler_Listesi")
                app.navigationBars.buttons.firstMatch.tap()
            }

            // Davet Kodu
            let inviteRow = app.staticTexts["Davet kodu"]
            if inviteRow.waitForExistence(timeout: 4) {
                scrollUntilHittable(inviteRow, in: app, maxSwipes: 6)
                inviteRow.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "55_Profil_Davet_Kodu_Ekrani")
                app.navigationBars.buttons.firstMatch.tap()
            }

            // Ayarlar
            let settingsBtn = app.buttons["profile-settings"]
            if settingsBtn.waitForExistence(timeout: 4) {
                scrollUntilHittable(settingsBtn, in: app, maxSwipes: 6)
                settingsBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                capture(app, name: "56_Ayarlar_Ana_Menu")

                // Bildirimler
                let notifLink = app.buttons["settings-open-notifications"]
                if notifLink.waitForExistence(timeout: 3) {
                    notifLink.tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                    capture(app, name: "57_Ayarlar_Bildirimler_Sayfasi")
                    app.navigationBars.buttons.firstMatch.tap()
                }

                // Gizlilik
                let privLink = app.buttons["settings-open-privacy"]
                if privLink.waitForExistence(timeout: 3) {
                    privLink.tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                    capture(app, name: "58_Ayarlar_Gizlilik_ve_Veri_Sayfasi")
                    app.navigationBars.buttons.firstMatch.tap()
                }

                // Çeviri
                let transLink = app.buttons["settings-open-translation"]
                if transLink.waitForExistence(timeout: 3) {
                    transLink.tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                    capture(app, name: "59_Ayarlar_Ceviri_Sayfasi")
                    app.navigationBars.buttons.firstMatch.tap()
                }

                // Tanılama
                let diagLink = app.buttons["settings-open-diagnostics"]
                if diagLink.waitForExistence(timeout: 3) {
                    diagLink.tap()
                    RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                    capture(app, name: "60_Ayarlar_Tanilama_Sayfasi")
                    app.navigationBars.buttons.firstMatch.tap()
                }

                app.navigationBars.buttons.firstMatch.tap()
            }

            // Çıkış Yap Diyalogu
            let signOutBtn = app.buttons["profile-sign-out"]
            if signOutBtn.waitForExistence(timeout: 4) {
                scrollUntilHittable(signOutBtn, in: app, maxSwipes: 6)
                signOutBtn.tap()
                RunLoop.current.run(until: Date().addingTimeInterval(0.6))
                capture(app, name: "61_Profil_Cikis_Yap_Onay_Diyalogu")
                if app.buttons["Vazgeç"].exists { app.buttons["Vazgeç"].tap() }
            }

            // Hesabı Sil Diyalogu
            let deleteBtn = app.buttons["profile-delete-account"]
            if deleteBtn.waitForExistence(timeout: 4) {
                scrollUntilHittable(deleteBtn, in: app, maxSwipes: 6)
                capture(app, name: "62_Profil_Hesap_Silme_Butonu_Gorunumu")
            }
            app.terminate()
        }

        // -------------------------------------------------------------
        // BÖLÜM 8: İzin ve Hata Kurtarma Durumları
        // -------------------------------------------------------------
        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_CAMERA_DENIED"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["Paylaş"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            capture(app, name: "63_Izin_Kurtarma_Kamera_Erisimi_Engellendi")
            app.terminate()
        }

        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_LOCATION_DENIED"]
            app.launch()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            capture(app, name: "64_Izin_Kurtarma_Konum_Erisimi_Engellendi")
            app.terminate()
        }

        do {
            let app = XCUIApplication()
            app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_DISCOVER_ERROR"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
            app.tabBars.buttons["Keşfet"].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            capture(app, name: "65_Hata_Durumu_Kesfet_Yukleme_Uyarisi")
            app.terminate()
        }
    }
}
