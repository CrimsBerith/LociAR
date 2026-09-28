import UIKit
import XCTest

@MainActor
final class AuthGateUITests: XCTestCase {
    func testPhysicalNormalAccountARTabReceivesCameraFrame() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek hesap ve kamera durumu fiziksel iPhone gerektirir.")
#else
        let app = XCUIApplication()
        app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 8) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }
        app.tabBars.buttons["AR"].tap()
        XCTAssertTrue(app.staticTexts["Kamera açık"].waitForExistence(timeout: 15), "Normal hesap akışında AR kamerası açılmadı.")
        XCTAssertFalse(app.buttons["Kapat"].exists, "AR sekmesi postu kullanıcı seçmeden açmamalı.")
        app.tabBars.buttons["Paylaş"].tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 10))
        capture(app, name: "physical-normal-account-new-pin")
#endif
    }

    func testPhysicalNormalAccountPublishesSocialARPostAndDeletesIt() throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Canlı AR yayını ve sosyal akış doğrulaması fiziksel iPhone gerektirir.")
#else
        let caption = "Canlı AR sosyal \(UUID().uuidString.prefix(6))"
        let app = XCUIApplication()
        app.launchArguments.append("UITEST_DISABLE_EXTERNAL_APP_LAUNCH")
        app.launchEnvironment["UITEST_EXTERNAL_MEDIA_URL"] = "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"
        addPrivacyAlertMonitor()
        app.launch()

        guard app.tabBars.firstMatch.waitForExistence(timeout: 10) else {
            throw XCTSkip("Cihazdaki normal uygulama oturumu giriş yapmış durumda değil.")
        }
        app.tabBars.buttons["Paylaş"].tap()
        app.tap()
        XCTAssertTrue(app.buttons["ar-pin-surface"].waitForExistence(timeout: 12))
        guard waitForPersistablePhysicalSurface(app, timeout: 120) else {
            let diagnostic = app.staticTexts["ar-mapping-diagnostic"].label
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
        app.buttons["create-publish"].tap()

        let resultAlert = app.alerts["LociAR"]
        XCTAssertTrue(resultAlert.waitForExistence(timeout: 20))
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

    private func identifiedControl(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let query = app.descendants(matching: .any)[identifier]
        return query
    }

    private func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 4) {
        for _ in 0..<maxSwipes {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func addPrivacyAlertMonitor() {
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
    private func publishPhysicalPost(
        _ app: XCUIApplication,
        caption: String,
        platform: String?,
        url: String?,
        readyLabel: String?
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

        if let platform, let url, let readyLabel {
            guard attachExternalMedia(app, platform: platform, url: url, readyLabel: readyLabel, caption: caption) else {
                return false
            }
        }

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
    private func attachExternalMedia(
        _ app: XCUIApplication,
        platform: String,
        url: String,
        readyLabel: String,
        caption: String
    ) -> Bool {
        dismissKeyboard(app)
        guard app.buttons["create-external-media-picker"].waitForExistence(timeout: 5) else {
            XCTFail("Sosyal seçici yok: \(caption)")
            return false
        }
        app.buttons["create-external-media-picker"].tap()
        guard app.navigationBars["Platform seç"].waitForExistence(timeout: 6) else {
            capture(app, name: "no-platform-picker-\(caption)")
            XCTFail("Platform seçici açılmadı: \(caption)")
            return false
        }
        let platformButton = app.buttons["external-platform-\(platform)"]
        guard platformButton.waitForExistence(timeout: 5) else {
            XCTFail("Platform düğmesi yok: \(caption)")
            return false
        }
        platformButton.tap()
        if app.buttons["Vazgeç"].waitForExistence(timeout: 4) {
            app.buttons["Vazgeç"].tap()
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.6))
        let linkField = app.textFields["create-external-media"]
        guard linkField.waitForExistence(timeout: 6) else {
            capture(app, name: "no-link-field-\(caption)")
            XCTFail("Bağlantı alanı yok: \(caption)")
            return false
        }
        linkField.tap()
        linkField.typeText(url)
        dismissKeyboard(app)
        guard app.staticTexts[readyLabel].waitForExistence(timeout: 6) else {
            capture(app, name: "import-failed-\(caption)")
            XCTFail("\(readyLabel) eklenmedi: \(caption)")
            return false
        }
        return true
    }

    @discardableResult
    private func openPublishedPostFromMapAndCapture(
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
    private func lockPhysicalPlacement(_ app: XCUIApplication, caption: String) -> Bool {
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

    private func recoverPhysicalSurface(_ app: XCUIApplication) -> Bool {
        if app.buttons["Tekrar dene"].exists {
            app.buttons["Tekrar dene"].tap()
        } else if app.buttons["Tekrar tara"].exists {
            app.buttons["Tekrar tara"].tap()
        }
        return waitForPhysicalSurfaceCandidate(app, timeout: 35)
    }

    private func recoverToMap(_ app: XCUIApplication) {
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

    private func dismissKeyboard(_ app: XCUIApplication) {
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

    private func mapRowDump(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "map-open-"))
            .allElementsBoundByIndex
            .map(\.identifier)
            .joined(separator: ", ")
    }

    private func waitForPhysicalSurfaceCandidate(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
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

    private func waitForPersistablePhysicalSurface(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
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

    private func waitForHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND isEnabled == true AND isHittable == true"),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

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

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        publishButton.tap()

        let alert = app.alerts["LociAR"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        alert.buttons["Tamam"].tap()
        capture(app, name: "userflow-spotify-published")
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

        let publishButton = app.buttons["create-publish"]
        XCTAssertTrue(publishButton.waitForExistence(timeout: 5))
        publishButton.tap()

        let alert = app.alerts["LociAR"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10), "Yayın alert'ı açılmadı.")
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

