import UIKit
import XCTest

/// Physical-device suites (skipped on the simulator). Run with scripts/run-device-e2e*.command.
extension AuthGateUITests {
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

    func testPhysicalNormalAccountPublishesSocialARPostAndDeletesIt() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı AR yayını ve sosyal akış doğrulaması fiziksel iPhone gerektirir.")
#else
        let caption = "Canlı AR sosyal \(UUID().uuidString.prefix(6))"
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_DISABLE_EXTERNAL_APP_LAUNCH", "-arcore_disclosure_acknowledged_v1", "YES"]
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"
        addPrivacyAlertMonitor()
        app.launch()

        guard app.tabBars.firstMatch.waitForExistence(timeout: 10) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }
        app.tabBars.buttons["Paylaş"].tap()
        app.tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 20))
        guard waitForPersistablePhysicalSurface(app, timeout: 120) else {
            let diagEl = app.staticTexts["ar-mapping-diagnostic"]
            let diagnostic = diagEl.exists ? diagEl.label : "(tanı yok)"
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
            let diagnostic = app.staticTexts["ar-mapping-diagnostic"].label
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
        app.buttons["create-external-media-picker"].tap()
        XCTAssertTrue(app.navigationBars["Platform seç"].waitForExistence(timeout: 5))
        app.buttons["external-platform-spotify"].tap()
        XCTAssertTrue(app.buttons["external-import-complete"].waitForExistence(timeout: 5))
        app.buttons["external-import-complete"].tap()
        XCTAssertTrue(app.staticTexts["Spotify paylaşımı hazır"].waitForExistence(timeout: 5))
        capture(app, name: "physical-live-social-editor")

        app.buttons["create-publish"].tap()
        let resultAlert = app.alerts["LociAR"]
        XCTAssertTrue(resultAlert.waitForExistence(timeout: 45), "Canlı yayın sonucu gelmedi.")
        guard resultAlert.staticTexts["Post yayınlandı. Keşfet ve profilinde görünür."].exists else {
            let alertText = resultAlert.staticTexts.allElementsBoundByIndex
                .map(\.label)
                .filter { !$0.isEmpty && $0 != "LociAR" }
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
        XCTAssertTrue(app.staticTexts["Postlarım"].waitForExistence(timeout: 8))
        app.staticTexts["Postlarım"].tap()
        XCTAssertTrue(app.navigationBars["Postlarım"].waitForExistence(timeout: 8))
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

    func testPhysicalRetriesExistingSocialARDeadLetterAndDeletesIt() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı dead-letter kurtarma doğrulaması fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 10) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }

        app.tabBars.buttons["Profil"].tap()
        guard app.staticTexts["Postlarım"].waitForExistence(timeout: 8) else {
            throw XCTSkip("Normal hesap profilinde Postlarım açılamadı.")
        }
        app.staticTexts["Postlarım"].tap()
        XCTAssertTrue(app.navigationBars["Postlarım"].waitForExistence(timeout: 8))
        let retry = app.buttons["my-posts-retry-pending"]
        guard retry.waitForExistence(timeout: 8) else {
            throw XCTSkip("Yeniden gönderilecek dead-letter AR postu yok.")
        }
        let queuedPost = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@",
            "Canlı AR sosyal "
        )).firstMatch
        XCTAssertTrue(queuedPost.waitForExistence(timeout: 8), "Bekleyen sosyal AR postu listelenmedi.")
        let caption = queuedPost.label
        retry.tap()

        app.tabBars.buttons["Keşfet"].tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 25), "Kurtarılan post Keşfet'te görünmedi.")
        capture(app, name: "physical-retried-social-post-discover")

        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 20), "Kurtarılan post AR listesinde görünmedi.")

        app.tabBars.buttons["Profil"].tap()
        XCTAssertTrue(app.staticTexts["Postlarım"].waitForExistence(timeout: 8))
        app.staticTexts["Postlarım"].tap()
        XCTAssertTrue(app.navigationBars["Postlarım"].waitForExistence(timeout: 8))
        let ownPost = app.staticTexts[caption]
        XCTAssertTrue(ownPost.waitForExistence(timeout: 20), "Kurtarılan post Postlarım'da görünmedi.")
        ownPost.swipeLeft()
        XCTAssertTrue(app.buttons["Sil"].waitForExistence(timeout: 5))
        app.buttons["Sil"].tap()
        XCTAssertTrue(app.buttons["Postu sil"].waitForExistence(timeout: 5))
        app.buttons["Postu sil"].tap()
        XCTAssertFalse(ownPost.waitForExistence(timeout: 20), "Silinen kurtarma postu listeden kalkmadı.")
        capture(app, name: "physical-retried-social-post-deleted")
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
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.buttons["Start Over"].exists)
        XCTAssertFalse(app.buttons["Tracking"].exists)
        capture(app, name: "physical-ar-live-camera")

        let nearbyFixture = app.staticTexts["Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."]
        XCTAssertTrue(nearbyFixture.waitForExistence(timeout: 8))
        nearbyFixture.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 8))
        let aimVisible = app.descendants(matching: .any)["ar-aim-guidance"].waitForExistence(timeout: 8)
            || app.staticTexts.matching(NSPredicate(
                format: "label CONTAINS %@ OR label CONTAINS %@ OR label CONTAINS %@ OR label CONTAINS %@ OR label CONTAINS %@",
                "Nokta atışı", "Sağa dön", "Sola dön", "Yön kilitleniyor", "Kamerayı"
            )).firstMatch.waitForExistence(timeout: 2)
            || app.staticTexts["Yüzey bulundu. İçerik hazır."].exists
        XCTAssertTrue(aimVisible, "Listeden açılan post nişan yönlendirmesini göstermedi.")
        app.buttons["Kapat"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.buttons["Start Over"].exists)
        XCTAssertFalse(app.buttons["Tracking"].exists)
        capture(app, name: "physical-ar-camera-after-viewer-dismiss")

        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Kameradan canlı görüntü alınamadı. Tekrar deneyin."].exists)
        capture(app, name: "physical-ar-new-pin")

        app.tabBars.buttons["Harita"].tap()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 5))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 12))
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
                app.staticTexts["Kamera açık"].waitForExistence(timeout: 12),
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
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 12))

        for cycle in 1...3 {
            XCUIDevice.shared.press(.home)
            RunLoop.current.run(until: Date().addingTimeInterval(1))
            app.activate()
            XCTAssertTrue(
                app.staticTexts["Kamera açık"].waitForExistence(timeout: 12),
                "AR kamera background/foreground \(cycle). döngüde dönemedi."
            )
        }

        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 12))
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
            let diagnostic = app.staticTexts["ar-mapping-diagnostic"].label
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

        let resultAlert = app.alerts["LociAR"]
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
        let socialCases: [(caption: String, platform: String?, url: String?, readyLabel: String?)] = [
            ("Metin post \(token)", nil, nil, nil),
            ("Spotify post \(token)", "spotify", "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU", "Spotify paylaşımı hazır"),
            ("YouTube post \(token)", "youtube", "https://youtu.be/dQw4w9WgXcQ", "YouTube paylaşımı hazır"),
            ("Facebook post \(token)", "facebook", "https://www.facebook.com/loci/posts/123", "Facebook paylaşımı hazır"),
            ("Instagram post \(token)", "instagram", "https://www.instagram.com/p/ABC123/", "Instagram paylaşımı hazır"),
            ("X post \(token)", "x", "https://x.com/loci/status/123", "X paylaşımı hazır"),
        ]
        var published: [String] = []
        var failures: [String] = []

        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_DISABLE_EXTERNAL_APP_LAUNCH"]
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 10))

        for item in socialCases {
            if publishPhysicalPost(app, caption: item.caption, platform: item.platform, url: item.url, readyLabel: item.readyLabel) {
                published.append(item.caption)
            } else {
                failures.append("Yayınlanamadı: \(item.caption)")
                recoverToMap(app)
            }
            RunLoop.current.run(until: Date().addingTimeInterval(1.2))
        }

        app.terminate()
        app.launchArguments += ["UITEST_ATTACH_SAMPLE_IMAGE"]
        app.launch()
        XCTAssertTrue(app.buttons["map-create"].waitForExistence(timeout: 10))
        let photoCaption = "Fotoğraf post \(token)"
        if publishPhysicalPost(app, caption: photoCaption, platform: nil, url: nil, readyLabel: nil) {
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

    func testPhysicalSocialPreviewCardRendersOnRealSurfaceWithSmallCaption() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Sosyal önizleme kartının AR yüzey render'ı fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launchArguments += ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_SOCIAL_AR_PREVIEW"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["AR"].waitForExistence(timeout: 8))
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.otherElements["screen-ar"].waitForExistence(timeout: 8))
        let socialPost = app.buttons["ar-nearby-post-33333333-3333-3333-3333-333333333333"]
        XCTAssertTrue(socialPost.waitForExistence(timeout: 12))
        socialPost.tap()
        XCTAssertTrue(app.otherElements["ar-post-viewer"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Yüzey bulundu. İçerik hazır."].waitForExistence(timeout: 60),
            "Sosyal önizleme kartı gerçek plane üzerinde açılamadı."
        )
        XCTAssertFalse(app.buttons["Yüzeye bağla"].exists)
        XCTAssertFalse(app.buttons["Bu yüzeye bağla"].exists)
        capture(app, name: "physical-social-preview-card-small-caption")
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
        XCTAssertTrue(
            waitForPhysicalSurfaceCandidate(app, timeout: 45),
            "Paylaş sekmesinde düzlem bulunamadı; telefonu dokulu zemin veya duvara tutun."
        )
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
        app.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT"]
        app.launch()

        // 1. Keşfet: Open post, like, save, view profile, back, open AR, close AR, back to Discover
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
        app.tabBars.buttons["Keşfet"].tap()
        let samplePostText = "Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."
        let postRow = app.staticTexts[samplePostText]
        XCTAssertTrue(postRow.waitForExistence(timeout: 8), "Keşfet postu bulunamadı.")
        postRow.tap()

        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 5), "Post detay ekranı açılmadı.")
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
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 5))

        // Open 3-dots more menu
        let moreMenu = app.buttons["post-more-menu"]
        if moreMenu.waitForExistence(timeout: 4) {
            moreMenu.tap()
            XCTAssertTrue(app.buttons["post-block-user"].waitForExistence(timeout: 3))
            // Dismiss menu by tapping navigation bar
            app.navigationBars["Post"].tap()
        }

        // Open AR viewer & close
        let openARButton = app.buttons["post-open-ar"]
        XCTAssertTrue(openARButton.waitForExistence(timeout: 5))
        openARButton.tap()
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 10), "AR görüntüleyici açılmadı.")
        capture(app, name: "device-post-ar-viewer")
        app.buttons["Kapat"].tap()

        // Verify back in Post detail
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 8))

        // Back to Discover
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Keşfet"].waitForExistence(timeout: 5))

        // 2. Harita: Open post & close
        app.tabBars.buttons["Harita"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen-map"].waitForExistence(timeout: 8))
        let mapPost = app.descendants(matching: .any)["map-open-\(samplePostText)"]
        if mapPost.waitForExistence(timeout: 6) {
            mapPost.tap()
            XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 5))
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
        approxButton.tap()

        // Transitions to "İçerik oluştur"
        XCTAssertTrue(app.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8), "İçerik oluştur ekranına geçilemedi.")
        capture(app, name: "device-pinned-editor-ready")

        let captionField = app.textFields["create-caption"]
        XCTAssertTrue(captionField.waitForExistence(timeout: 5))
        captionField.tap()
        captionField.typeText("iPhone Fiziksel Pin Testi")
        dismissKeyboard(app)

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        XCTAssertTrue(waitForHittable(publishButton, timeout: 5), "Publish butonu erişilemez")
        publishButton.tap()

        let alert = app.alerts["LociAR"]
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
            WallItem(key: "spotify", name: "Spotify", isSocial: true, isPhoto: false, url: "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU", caption: "Spotify müzik anısı bu duvara sabitlendi."),
            WallItem(key: "youtube", name: "YouTube", isSocial: true, isPhoto: false, url: "https://youtu.be/dQw4w9WgXcQ", caption: "YouTube videosu bu duvara sabitlendi."),
            WallItem(key: "facebook", name: "Facebook", isSocial: true, isPhoto: false, url: "https://www.facebook.com/loci/posts/101584920482910", caption: "Facebook topluluk gönderisi bu duvara sabitlendi."),
            WallItem(key: "instagram", name: "Instagram", isSocial: true, isPhoto: false, url: "https://www.instagram.com/p/DF123XYZ/", caption: "Instagram anısı bu duvara mühürlendi."),
            WallItem(key: "x", name: "X", isSocial: true, isPhoto: false, url: "https://x.com/apple/status/1880000000000000000", caption: "X üzerindeki güncel duyuru burada."),
            WallItem(key: "photo", name: "Fotoğraf", isSocial: false, isPhoto: true, url: nil, caption: "Tarihi taş duvarın özel anı fotoğrafı.")
        ]

        for item in items {
            // 1. Editor verification & capture (Anchored to Vertical Wall)
            let editorApp = XCUIApplication()
            var editorArgs = ["UITEST_AUTHENTICATED", "UITEST_EDITOR_PREVIEW", "UITEST_OPEN_EDITOR_DIRECTLY"]
            if item.isSocial {
                editorArgs.append("UITEST_DISABLE_EXTERNAL_APP_LAUNCH")
            }
            if item.isPhoto {
                editorArgs.append("UITEST_ATTACH_SAMPLE_IMAGE")
            }
            editorApp.launchArguments = editorArgs
            if let url = item.url {
                editorApp.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = url
            }
            editorApp.launch()

            XCTAssertTrue(editorApp.navigationBars["İçerik oluştur"].waitForExistence(timeout: 8))
            XCTAssertTrue(editorApp.staticTexts["Dikey yüzey hazır"].waitForExistence(timeout: 5))

            if item.isSocial {
                editorApp.buttons["create-external-media-picker"].tap()
                XCTAssertTrue(editorApp.navigationBars["Platform seç"].waitForExistence(timeout: 5))
                editorApp.buttons["external-platform-\(item.key)"].tap()
                XCTAssertTrue(editorApp.buttons["external-import-complete"].waitForExistence(timeout: 5))
                editorApp.buttons["external-import-complete"].tap()
                XCTAssertTrue(editorApp.staticTexts["\(item.name) paylaşımı hazır"].waitForExistence(timeout: 5))
                XCTAssertTrue(editorApp.descendants(matching: .any)["external-media-selection-preview"].waitForExistence(timeout: 5))
            }

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

            let alert = editorApp.alerts["LociAR"]
            XCTAssertTrue(alert.waitForExistence(timeout: 10))
            alert.buttons["Tamam"].tap()

            editorApp.terminate()

            // 2. Post detail card & AR viewer capture (Spatial on Vertical Wall)
            let postApp = XCUIApplication()
            postApp.launchArguments = ["UITEST_AUTHENTICATED", "UITEST_SAMPLE_CONTENT", "UITEST_OPEN_POST_DIRECTLY", "UITEST_WALL_AR_PREVIEW"]
            postApp.launchEnvironment["UITEST_FIXTURE_PLATFORM"] = item.key
            postApp.launch()

            XCTAssertTrue(postApp.navigationBars["Post"].waitForExistence(timeout: 8))
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
}
