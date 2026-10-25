import UIKit
import XCTest

// MARK: - Emulator end-to-end (real app code + local Firebase Emulator Suite)
//
// Driven by scripts/run-device-e2e.command, which starts the emulators, auto-verifies pending
// verification emails in the Auth emulator and passes E2E_EMAIL / E2E_PASSWORD through
// TEST_RUNNER_* environment variables. Tests run in order 01…09 against ONE fresh account.
extension AuthGateUITests {
    private var e2eEmail: String { ProcessInfo.processInfo.environment["E2E_EMAIL"] ?? "" }
    private var e2ePassword: String { ProcessInfo.processInfo.environment["E2E_PASSWORD"] ?? "" }

    private func e2eField(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func e2eType(_ app: XCUIApplication, _ id: String, _ text: String) {
        let field = e2eField(app, id)
        XCTAssertTrue(field.waitForExistence(timeout: 8), "Alan yok: \(id)")
        e2eReplace(field, with: text)
    }

    private func e2eReplace(_ field: XCUIElement, with text: String) {
        if field.value as? String == text { return }
        field.tap()
        if let current = field.value as? String, !current.isEmpty, !current.hasPrefix("E-posta"), !current.hasPrefix("Şifre") {
#if targetEnvironment(simulator)
            // Command-A is not reliable with the simulator's software keyboard.
            // Put the caret after the visible value, then verify the full replacement below.
            field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 1))
#else
            // Tapping a physical text field puts the caret in the middle. Select all before
            // deleting, otherwise the old suffix survives (e.g. .testlociar.test).
            field.press(forDuration: 1.1)
            let app = XCUIApplication()
            let all = app.descendants(matching: .any).matching(NSPredicate(
                format: "label == %@ OR label == %@", "Tümünü Seç", "Select All"
            )).firstMatch
            guard all.waitForExistence(timeout: 3) else {
                XCTFail("Metin alanını temizlemek için Tümünü Seç menüsü bulunamadı.")
                return
            }
            all.tap()
            field.typeText(XCUIKeyboardKey.delete.rawValue)
#endif
        }
        field.typeText(text)
        if field.elementType == .textField { XCTAssertEqual(field.value as? String, text) }
    }

    private func e2eAllowSystemAlerts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<3 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 2) else { return }
            for title in ["İzin Ver", "Allow", "Uygulamayı Kullanırken İzin Ver", "Allow While Using App",
                          "Her Zaman İzin Ver", "Her Zaman İzin Ver Olarak Değiştir", "Always Allow", "Change to Always Allow", "Tamam", "OK"] {
                if alert.buttons[title].exists { alert.buttons[title].tap(); break }
            }
        }
    }

    private func e2eMessageText(_ app: XCUIApplication) -> String {
        app.staticTexts.allElementsBoundByIndex.map(\.label)
            .filter { $0.contains("DEBUG") || $0.contains("Hesab") || $0.contains("Giriş yapılamadı") || $0.contains("doğrula") }
            .joined(separator: " | ")
    }

    private func e2ePassOnboarding(_ app: XCUIApplication) {
        for _ in 0..<8 {
            let finish = e2eField(app, "onboarding-finish")
            let next = e2eField(app, "onboarding-next")
            if finish.exists { finish.tap(); return }
            if next.exists { next.tap(); continue }
            return
        }
    }

    private func e2eSignOutIfNeeded(_ app: XCUIApplication) {
        guard app.tabBars.firstMatch.waitForExistence(timeout: 4) else { return }
        app.tabBars.buttons["Profil"].tap()
        let signOut = app.buttons["profile-sign-out"]
        for _ in 0..<6 where !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        _ = e2eField(app, "auth-email-field").waitForExistence(timeout: 10)
    }

    /// The sign-in screen requires the explicit privacy/terms consent checkbox.
    private func e2eAcceptTerms(_ app: XCUIApplication) {
        let consent = e2eField(app, "auth-terms-consent")
        guard consent.waitForExistence(timeout: 5), !consent.isSelected else { return }
        for _ in 0..<4 where !consent.isHittable { app.swipeUp() }
        consent.tap()
    }

    private func e2eSignIn(_ app: XCUIApplication) -> Bool {
        for attempt in 0..<4 {
            app.buttons["auth-mode-signin"].tap()
            e2eType(app, "auth-email-field", e2eEmail)
            e2eType(app, "auth-password-field", e2ePassword)
            dismissKeyboard(app)
            e2eAcceptTerms(app)
            e2eField(app, "auth-email-submit").tap()
            if app.tabBars.firstMatch.waitForExistence(timeout: 30) { return true }
            capture(app, name: "e2e-signin-attempt-\(attempt)")
            print("[E2E] giriş denemesi \(attempt) başarısız: \(e2eMessageText(app))")
            RunLoop.current.run(until: Date().addingTimeInterval(4)) // verification loop on the Mac
        }
        return false
    }

    func testEmulator01SignUpVerifyAndSignIn() throws {
        guard !e2eEmail.isEmpty else { throw XCTSkip("E2E_EMAIL yok — scripts/run-device-e2e.command ile çalıştırın.") }
        continueAfterFailure = false
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        e2eAllowSystemAlerts()
        e2ePassOnboarding(app)
        e2eSignOutIfNeeded(app)

        let signUp = app.buttons["auth-mode-signup"]
        if !signUp.waitForExistence(timeout: 10) {
            capture(app, name: "e2e-auth-gate-missing")
            print("[E2E] startup controls: \(app.buttons.allElementsBoundByIndex.map { $0.identifier + ":" + $0.label })")
            XCTFail("Giriş ekranı açılmadı.")
            return
        }
        app.buttons["auth-mode-signup"].tap()
        e2eType(app, "auth-email-field", e2eEmail)
        e2eType(app, "auth-password-field", e2ePassword)
        e2eType(app, "auth-confirm-password-field", e2ePassword)
        dismissKeyboard(app)
        e2eAcceptTerms(app)
        e2eField(app, "auth-email-submit").tap()
        e2eAllowSystemAlerts() // iOS "yerel ağ" izni ilk emulator bağlantısında sorulur
        let created = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Hesabın oluşturuldu")).firstMatch
        if !created.waitForExistence(timeout: 30) {
            capture(app, name: "e2e-signup-failed")
            XCTFail("KAYIT BAŞARISIZ: \(e2eMessageText(app))")
            return
        }
        capture(app, name: "e2e-signup-ok")
        RunLoop.current.run(until: Date().addingTimeInterval(5)) // Mac tarafındaki doğrulama döngüsü
        XCTAssertTrue(e2eSignIn(app), "GİRİŞ BAŞARISIZ (ensureProfile?): \(e2eMessageText(app))")
        capture(app, name: "e2e-signed-in")
    }

    /// Live pipeline phase one; the owner verifies the email before phase two runs.
    func testProd00SignUpOnly() throws {
        guard ProcessInfo.processInfo.environment["E2E_PRODUCTION"] == "1",
              !e2eEmail.isEmpty, !e2ePassword.isEmpty else { throw XCTSkip("Canlı test açıkça seçilmedi.") }
        continueAfterFailure = false
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        e2eAllowSystemAlerts()
        e2ePassOnboarding(app)
        e2eSignOutIfNeeded(app)
        XCTAssertTrue(app.buttons["auth-mode-signup"].waitForExistence(timeout: 10))
        app.buttons["auth-mode-signup"].tap()
        e2eType(app, "auth-email-field", e2eEmail)
        e2eType(app, "auth-password-field", e2ePassword)
        e2eType(app, "auth-confirm-password-field", e2ePassword)
        dismissKeyboard(app)
        e2eAcceptTerms(app)
        e2eField(app, "auth-email-submit").tap()
        let created = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Hesabın oluşturuldu")).firstMatch
        XCTAssertTrue(created.waitForExistence(timeout: 30), "Canlı kayıt başarısız: \(e2eMessageText(app))")
        capture(app, name: "production-signup-awaiting-owner-verification")
    }

    func testProd01SignIn() throws {
        guard ProcessInfo.processInfo.environment["E2E_PRODUCTION"] == "1",
              !e2eEmail.isEmpty, !e2ePassword.isEmpty else { throw XCTSkip("Canlı test açıkça seçilmedi.") }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        e2ePassOnboarding(app)
        e2eSignOutIfNeeded(app)
        XCTAssertTrue(e2eSignIn(app), "Canlı giriş başarısız: \(e2eMessageText(app))")
    }

    func testEmulator03BrowseTabsAndEditProfile() throws {
        guard !e2eEmail.isEmpty else { throw XCTSkip("E2E_EMAIL yok") }
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        e2eAllowSystemAlerts()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15), "Oturum kalıcı değil.")
        for tab in ["Harita", "Keşfet", "AR", "Profil"] where app.tabBars.buttons[tab].exists {
            app.tabBars.buttons[tab].tap()
            RunLoop.current.run(until: Date().addingTimeInterval(1.5))
            capture(app, name: "e2e-tab-\(tab)")
        }
        app.tabBars.buttons["Profil"].tap()
        let edit = app.buttons["profile-edit-button"]
        XCTAssertTrue(edit.waitForExistence(timeout: 8))
        edit.tap()
        let handleField = app.textFields["kullanıcı_adı"].exists ? app.textFields["kullanıcı_adı"] : app.textFields.firstMatch
        XCTAssertTrue(handleField.waitForExistence(timeout: 8))
        let newHandle = "e2e_" + String(Int(Date().timeIntervalSince1970) % 100000)
        e2eReplace(handleField, with: newHandle)
        app.buttons["profile-edit-save"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", newHandle)).firstMatch
            .waitForExistence(timeout: 15), "Profil güncellemesi (Firestore kuralı) başarısız.")
        capture(app, name: "e2e-profile-edited")
    }

    private func simulatorFixture(_ action: String) async throws -> [String: String] {
        guard let base = ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"],
              let url = URL(string: base + "/" + action) else {
            throw XCTSkip("Yerel simülatör fixture servisi seçilmedi.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200,
                       String(data: data, encoding: .utf8) ?? "Fixture yanıtı yok")
        return try JSONDecoder().decode([String: String].self, from: data)
    }

    func testEmulator03bSavedAndCollectionListsPageWithoutFanout() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör fixture servisi seçilmedi.")
        }
        continueAfterFailure = false
        let fixture = try await simulatorFixture("prepare-paged-lists")
        let firstSaved = try XCTUnwrap(fixture["firstSaved"]), lastSaved = try XCTUnwrap(fixture["lastSaved"])
        let firstCollection = try XCTUnwrap(fixture["firstCollection"]), lastCollection = try XCTUnwrap(fixture["lastCollection"])
        let title = try XCTUnwrap(fixture["collectionTitle"])
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Profil"].tap()
        let saved = e2eField(app, "profile-saved")
        scrollUntilHittable(saved, in: app, maxSwipes: 6); saved.tap()
        XCTAssertTrue(app.staticTexts[firstSaved].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts[lastSaved].exists, "İlk sayfa bütün kaydedilenleri yüklememeli.")
        let more = app.buttons["Daha fazla göster"]
        scrollUntilHittable(more, in: app, maxSwipes: 10); more.tap()
        scrollUntilHittable(app.staticTexts[lastSaved], in: app, maxSwipes: 8)
        XCTAssertTrue(app.staticTexts[lastSaved].exists)
        capture(app, name: "cost-saved-second-page")
        app.navigationBars.buttons.firstMatch.tap()
        let collections = e2eField(app, "profile-collections")
        scrollUntilHittable(collections, in: app, maxSwipes: 6); collections.tap()
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15)); app.staticTexts[title].tap()
        XCTAssertTrue(app.staticTexts[firstCollection].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts[lastCollection].exists, "İlk sayfa bütün koleksiyonu yüklememeli.")
        scrollUntilHittable(more, in: app, maxSwipes: 10); more.tap()
        scrollUntilHittable(app.staticTexts[lastCollection], in: app, maxSwipes: 8)
        XCTAssertTrue(app.staticTexts[lastCollection].exists)
        capture(app, name: "cost-collection-second-page")
    }

    func testEmulator02dMapGroupRequiresOnSiteFixAndRanksAllNotes() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör harita grubu testi seçilmedi.")
        }
        continueAfterFailure = false
        let fixture = try await simulatorFixture("prepare-map-group")
        let groupId = try XCTUnwrap(fixture["groupId"])
        let expectedCount = try XCTUnwrap(fixture["expectedCount"])
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons["Harita"].tap()
        let badge = app.buttons["map-note-group-\(groupId)"]
        let map = app.maps.firstMatch
        XCTAssertTrue(map.waitForExistence(timeout: 15))
        let heat = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "map-heat-")).firstMatch
        for _ in 0..<3 {
            if heat.waitForExistence(timeout: 2) { break }
            map.pinch(withScale: 0.2, velocity: -1)
        }
        XCTAssertTrue(heat.waitForExistence(timeout: 15))
        capture(app, name: "glass-map-wide-density")
        heat.tap()
        XCTAssertFalse(app.buttons["map-group-open-here"].exists, "Isı alanına dokunmak yalnız haritayı yakınlaştırmalı.")
        for _ in 0..<7 {
            if badge.waitForExistence(timeout: 2) { break }
            map.pinch(withScale: 2, velocity: 1)
        }
        XCTAssertTrue(badge.waitForExistence(timeout: 15), "Aynı noktadaki on not tek sayaçta görünmeli.")
        XCTAssertEqual(badge.label, "\(expectedCount) not")
        capture(app, name: "glass-map-ten-note-count")
        badge.tap()
        let open = app.buttons["map-group-open-here"]
        XCTAssertTrue(open.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Glass note 10"].exists, "Haritada yakınlaşmak içerik açmamalı.")
        capture(app, name: "glass-map-remote-group-locked")
        _ = try await simulatorFixture("enter-map-group")
        open.tap()
        let first = app.staticTexts["Glass note 10"], second = app.staticTexts["Glass note 9"]
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        XCTAssertTrue(second.exists)
        XCTAssertLessThan(first.frame.minY, second.frame.minY, "En çok beğenilen not önce görünmeli.")
        capture(app, name: "glass-map-near-group-ranked")
        first.tap()
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["İlk yorumu sen yaz."].waitForExistence(timeout: 15), "Yerinde açılan notun yorum oturumu da yetkilendirilmeli.")
        capture(app, name: "glass-map-near-note-opened")
        _ = try await simulatorFixture("leave-map-group")
        let detailClosed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.navigationBars["Post"])
        await fulfillment(of: [detailClosed], timeout: 15)
        let hidden = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: first)
        await fulfillment(of: [hidden], timeout: 15)
        XCTAssertTrue(open.exists)
        XCTAssertFalse(app.staticTexts["İlk yorumu sen yaz."].exists, "Uzaklaşınca açık detay ve yorumları da kapanmalı.")
        capture(app, name: "glass-map-group-closes-after-leaving")
    }

    func testEmulator02CameraFreeNotePublishesAndAppearsWithoutManualRefresh() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör yayın testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        app.buttons["map-location-note"].tap()
        let field = e2eField(app, "place-note-text")
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let publish = app.buttons["place-note-publish"]
        scrollUntilHittable(publish, in: app, maxSwipes: 6)
        XCTAssertFalse(publish.isEnabled, "Boş not yayınlanmamalı.")
        app.buttons["Kapat"].tap()
        app.buttons["map-location-note"].tap()
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        field.tap()
        field.typeText(String(repeating: "a", count: 221))
        dismissKeyboard(app)
        scrollUntilHittable(publish, in: app, maxSwipes: 6)
        XCTAssertFalse(publish.isEnabled, "220 karakter sınırı uygulanmalı.")
        app.buttons["Kapat"].tap()
        app.buttons["map-location-note"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let measured = app.staticTexts.matching(NSPredicate(format:
            "label BEGINSWITH %@ OR label BEGINSWITH %@", "Konum hazır · ±", "Konum hassaslaşıyor · ±")).firstMatch
        XCTAssertTrue(measured.waitForExistence(timeout: 30))
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        let caption = "Simulator camera free note"
        field.tap()
        field.typeText(caption)
        dismissKeyboard(app)
        XCTAssertFalse(app.buttons["ar-pin-surface"].exists)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        scrollUntilHittable(publish, in: app)
        publish.tap()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Notun yayınlandı. Haritada görünüyor."].waitForExistence(timeout: 60))
        let status = e2eField(app, "place-note-status")
        XCTAssertTrue(status.exists)
        XCTAssertGreaterThanOrEqual(status.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(status.frame.maxY, app.frame.maxY, "Başarı mesajı küçük ekranda da görünür kalmalı.")
        XCTAssertFalse(publish.isEnabled, "Başarılı gönderim ikinci kez yayınlanmamalı.")
        capture(app, name: "simulator-note-published-without-camera")
        let verified = try await simulatorFixture("verify-published")
        XCTAssertEqual(verified["caption"], caption)
        XCTAssertEqual(verified["count"], "1")
        XCTAssertEqual(verified["anonymous"], "true")
        XCTAssertEqual(verified["source"], "gps")
        app.buttons["Kapat"].tap()
        let groupId = try XCTUnwrap(verified["groupId"])
        let row = app.buttons["map-summary-group-\(groupId)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20), "Yeni notun grup özeti, elle Yenile gerektirmeden görünmeli.")
        XCTAssertFalse(app.staticTexts[caption].exists, "Harita özeti not gövdesini önceden yüklememeli.")
        capture(app, name: "simulator-note-on-map")
        row.tap()
        XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 10))
        app.staticTexts[caption].tap()
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["ar-pin-surface"].exists)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        capture(app, name: "simulator-camera-free-note-opened")
    }

    func testEmulator02bMissingFixDoesNotPublishAndFreshFixAllowsRetry() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör konum kurtarma testi seçilmedi.")
        }
        continueAfterFailure = false
        _ = try await simulatorFixture("pause-location")
        try await Task.sleep(for: .seconds(4))
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        app.buttons["map-location-note"].tap()
        let field = e2eField(app, "place-note-text")
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        field.tap(); field.typeText("Fresh fix retry note")
        let publish = app.buttons["place-note-publish"]
        scrollUntilHittable(publish, in: app, maxSwipes: 6)
        publish.tap()
        XCTAssertFalse(app.buttons["Kapat"].isEnabled, "Konum beklenirken yayın ekranı erken kapatılmamalı.")
        XCTAssertFalse(field.isEnabled, "Bekleyen gönderimin metni ve mutation kimliği değişmemeli.")
        app.navigationBars["Konum notu bırak"].swipeDown()
        XCTAssertTrue(app.navigationBars["Konum notu bırak"].exists, "Sürükleyerek kapatma da bekleyen yayını kesmemeli.")
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin."].waitForExistence(timeout: 25))
        XCTAssertTrue(app.buttons["Kapat"].isEnabled, "Başarısız denemeden sonra ekran kapanabilmeli.")
        let rejected = try await simulatorFixture("verify-no-fix")
        XCTAssertEqual(rejected["count"], "1", "Geçerli ölçüm yokken yeni not oluşturulmamalı.")
        capture(app, name: "simulator-no-fix-does-not-publish")
        _ = try await simulatorFixture("resume-location")
        try await Task.sleep(for: .seconds(3))
        scrollUntilHittable(publish, in: app, maxSwipes: 6)
        publish.tap()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Notun yayınlandı. Haritada görünüyor."].waitForExistence(timeout: 30))
        let accepted = try await simulatorFixture("verify-fix-retry")
        XCTAssertEqual(accepted["count"], "2")
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        capture(app, name: "simulator-fresh-fix-retry-published")
        app.buttons["Kapat"].tap()
    }

    func testEmulator02cFilteredTextIsLocalizedAndRetryPublishes() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör metin filtresi testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        for (text, message) in [("See https://example.com", "Postlar yalnızca metin ve GIF içerebilir; fotoğraf, video, çizim ve bağlantı desteklenmiyor."),
                                ("siktir git", "Metin uygunsuz ifadeler içeriyor. Düzenleyip tekrar dene.")] {
            app.buttons["map-location-note"].tap()
            let field = e2eField(app, "place-note-text")
            scrollUntilHittable(field, in: app, maxSwipes: 6)
            field.tap(); field.typeText(text)
            dismissKeyboard(app)
            let publish = app.buttons["place-note-publish"]
            scrollUntilHittable(publish, in: app, maxSwipes: 6)
            publish.tap()
            app.swipeUp()
            XCTAssertTrue(app.staticTexts[message].waitForExistence(timeout: 30))
            XCTAssertTrue(app.buttons["Kapat"].isEnabled)
            let rejected = try await simulatorFixture("verify-fix-retry")
            XCTAssertEqual(rejected["count"], "2", "Reddedilen metin sunucuya post olarak yazılmamalı.")
            capture(app, name: text.contains("https") ? "simulator-localized-link-rejection" : "simulator-localized-moderation-rejection")
            app.buttons["Kapat"].tap()
        }
        app.buttons["map-location-note"].tap()
        let field = e2eField(app, "place-note-text")
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        field.tap(); field.typeText("Filtered text corrected")
        dismissKeyboard(app)
        let publish = app.buttons["place-note-publish"]
        scrollUntilHittable(publish, in: app, maxSwipes: 6)
        publish.tap(); app.swipeUp()
        XCTAssertTrue(app.staticTexts["Notun yayınlandı. Haritada görünüyor."].waitForExistence(timeout: 30))
        let accepted = try await simulatorFixture("verify-filter-retry")
        XCTAssertEqual(accepted["count"], "3")
        app.buttons["Kapat"].tap()
    }

    func testEmulator04NotificationConsentPersistsWithoutMarketingOrLocationSharing() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör bildirim testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Profil"].tap()
        scrollUntilHittable(app.buttons["profile-settings"], in: app, maxSwipes: 6)
        app.buttons["profile-settings"].tap()
        let notifications = app.switches["settings-notifications"]
        XCTAssertTrue(notifications.waitForExistence(timeout: 10))
        XCTAssertEqual(notifications.value as? String, "0")
        notifications.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        e2eAllowSystemAlerts()
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: notifications)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 20), .completed)
        let marketing = app.switches["settings-promotions"]
        scrollUntilHittable(marketing, in: app)
        XCTAssertEqual(marketing.value as? String, "0")
        let verified = try await simulatorFixture("verify-consent")
        XCTAssertEqual(verified["notifications"], "true")
        XCTAssertEqual(verified["placeNotes"], "true")
        XCTAssertEqual(verified["promotions"], "false")
        XCTAssertEqual(verified["location"], "false")
        XCTAssertEqual(verified["telemetry"], "false")
        app.terminate()
        app.launch()
        app.tabBars.buttons["Profil"].tap()
        scrollUntilHittable(app.buttons["profile-settings"], in: app, maxSwipes: 6)
        app.buttons["profile-settings"].tap()
        XCTAssertTrue(notifications.waitForExistence(timeout: 10))
        XCTAssertEqual(notifications.value as? String, "1")
        capture(app, name: "simulator-notification-consent-persisted")
    }

    func testEmulator06LocationEntryQueuesOneNotificationAndOpensTheNote() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör giriş bildirimi testi seçilmedi.")
        }
        continueAfterFailure = false
        let prepared = try await simulatorFixture("prepare-arrival")
        let app = XCUIApplication()
        addPrivacyAlertMonitor()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        _ = try await simulatorFixture("enter-arrival")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[prepared["body"]!].firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 90), "Gerçek konum akışı + callable + yerel bildirim zinciri bildirim üretmeli.")
        capture(springboard, name: "simulator-location-entry-notification")
        notification.tap()
        XCTAssertTrue(app.navigationBars["Post"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Notları görmek için yaklaş ve haritada aç."].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts[prepared["body"]!].exists, "Bildirim yönlendirmesi konumsuz not gövdesini açmamalı.")
        XCTAssertTrue(app.buttons["Konumu gör"].firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        let verified = try await simulatorFixture("verify-arrival")
        XCTAssertEqual(verified["deliveries"], "1")
        XCTAssertEqual(verified["state"], "queued")
        capture(app, name: "simulator-location-notification-opened-note")
    }

    func testEmulator07AdminNotificationOpensActivityWithMarketingOff() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör admin bildirimi testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        XCUIDevice.shared.press(.home)
        let sent = try await simulatorFixture("send-admin")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[sent["body"]!].firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 20))
        capture(springboard, name: "simulator-admin-notification")
        notification.tap()
        XCTAssertTrue(app.navigationBars["Aktivite"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts[sent["body"]!].waitForExistence(timeout: 20))
        let verified = try await simulatorFixture("verify-admin")
        XCTAssertEqual(verified["accepted"], "1")
        XCTAssertEqual(verified["read"], "true")
        capture(app, name: "simulator-admin-notification-opened")
    }

    func testEmulator07bAdminNotificationColdLaunchOpensActivity() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör soğuk açılış testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.terminate()
        let sent = try await simulatorFixture("send-admin")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[sent["body"]!].firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 20))
        notification.tap()
        XCTAssertTrue(app.navigationBars["Aktivite"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[sent["body"]!].waitForExistence(timeout: 20))
        let verified = try await simulatorFixture("verify-admin")
        XCTAssertEqual(verified["accepted"], "1")
        XCTAssertEqual(verified["read"], "true")
        capture(app, name: "simulator-admin-notification-cold-launch")
    }

    func testEmulator07cForeignRecipientCannotPresentOrNavigate() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör bildirim alıcısı testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        let sent = try await simulatorFixture("send-foreign")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[sent["body"]!].firstMatch
        let absent = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true"), object: notification)
        absent.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [absent], timeout: 4), .completed, "Başka hesaba ait ön plan bildirimi gösterilmemeli.")
        XCUIDevice.shared.press(.home)
        try await Task.sleep(for: .seconds(1))
        let background = try await simulatorFixture("send-foreign")
        let backgroundNotification = springboard.staticTexts[background["body"]!].firstMatch
        // A synthetic background push is shown by iOS before app code runs.
        // Its tap must still be rejected by the recipient fence.
        XCTAssertTrue(backgroundNotification.waitForExistence(timeout: 20))
        backgroundNotification.tap()
        XCTAssertTrue(app.navigationBars["Harita"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.navigationBars["Aktivite"].exists)
        XCTAssertFalse(app.navigationBars["Post"].exists)
        capture(app, name: "simulator-foreign-recipient-rejected")
    }

    func testEmulator07dForegroundAdminNotificationOpensActivity() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör ön plan bildirimi testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        let sent = try await simulatorFixture("send-admin")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notification = springboard.staticTexts[sent["body"]!].firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 20), "Ön plandaki uygulama geçerli alıcının bildirimini göstermeli.")
        capture(springboard, name: "simulator-foreground-admin-notification")
        notification.tap()
        XCTAssertTrue(app.navigationBars["Aktivite"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts[sent["body"]!].waitForExistence(timeout: 20))
        let verified = try await simulatorFixture("verify-admin")
        XCTAssertEqual(verified["accepted"], "1")
        XCTAssertEqual(verified["read"], "true")
    }

    func testEmulator08NotificationsOffPreventsAdminQueue() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör bildirim testi seçilmedi.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Profil"].tap()
        scrollUntilHittable(app.buttons["profile-settings"], in: app, maxSwipes: 6)
        app.buttons["profile-settings"].tap()
        let notifications = app.switches["settings-notifications"]
        XCTAssertTrue(notifications.waitForExistence(timeout: 10))
        XCTAssertEqual(notifications.value as? String, "1")
        notifications.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        let disabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '0'"), object: notifications)
        XCTAssertEqual(XCTWaiter.wait(for: [disabled], timeout: 20), .completed)
        let verified = try await simulatorFixture("verify-off")
        XCTAssertEqual(verified["blocked"], "true")
        XCTAssertEqual(verified["newJobs"], "0")
        capture(app, name: "simulator-notifications-disabled")
    }

    func testEmulator08bDeniedLocationBlocksPublishingAndRecovers() async throws {
        guard !e2eEmail.isEmpty, ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil else {
            throw XCTSkip("Yerel simülatör izin testi seçilmedi.")
        }
        continueAfterFailure = false
        _ = try await simulatorFixture("deny-location")
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Harita"].tap()
        app.buttons["map-location-note"].tap()
        XCTAssertTrue(app.staticTexts["Konum izni kapalı. Ayarlar’dan LociAR için konumu açın."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Yaklaşık konum izni açık. Notu doğru yere bırakmak için Ayarlar’dan Kesin Konum’u aç."].exists)
        let field = e2eField(app, "place-note-text")
        scrollUntilHittable(field, in: app, maxSwipes: 6)
        field.tap(); field.typeText("Permission recovery note")
        dismissKeyboard(app)
        scrollUntilHittable(app.buttons["place-note-publish"], in: app, maxSwipes: 6)
        XCTAssertFalse(app.buttons["place-note-publish"].isEnabled)
        XCTAssertFalse(app.staticTexts["Kamera açık"].exists)
        capture(app, name: "simulator-location-denied")
        app.terminate()
        _ = try await simulatorFixture("grant-location")
        app.launch()
        app.tabBars.buttons["Harita"].tap()
        app.buttons["map-location-note"].tap()
        let measured = app.staticTexts.matching(NSPredicate(format:
            "label BEGINSWITH %@ OR label BEGINSWITH %@", "Konum hazır · ±", "Konum hassaslaşıyor · ±")).firstMatch
        XCTAssertTrue(measured.waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts["Konum izni kapalı. Ayarlar’dan LociAR için konumu açın."].exists)
        capture(app, name: "simulator-location-permission-recovered")
        app.buttons["Kapat"].tap()
    }

    func testEmulator05SignOutAndBackIn() throws {
        guard !e2eEmail.isEmpty else { throw XCTSkip("E2E_EMAIL yok") }
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        e2eSignOutIfNeeded(app)
        XCTAssertTrue(e2eField(app, "auth-email-field").exists, "Çıkış sonrası giriş ekranı yok.")
        XCTAssertTrue(e2eSignIn(app), "Tekrar giriş başarısız: \(e2eMessageText(app))")
    }

    func testEmulator09DeleteAccount() async throws {
        guard !e2eEmail.isEmpty else { throw XCTSkip("E2E_EMAIL yok") }
        let fixtureEnabled = ProcessInfo.processInfo.environment["E2E_FIXTURE_URL"] != nil
        if fixtureEnabled { _ = try await simulatorFixture("prepare-deletion") }
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        let profile = app.tabBars.buttons["Profil"]
        for _ in 0..<3 {
            profile.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            if app.navigationBars["Profil"].waitForExistence(timeout: 5) { break }
        }
        XCTAssertTrue(app.navigationBars["Profil"].exists)
        let delete = app.buttons["profile-delete-account"]
        for _ in 0..<6 where !delete.isHittable { app.swipeUp() }
        delete.tap()
        let alert = app.alerts["Hesabı kalıcı olarak sil?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Devam et"].tap()
        let password = app.secureTextFields["account-delete-password"]
        XCTAssertTrue(password.waitForExistence(timeout: 10), "Silmeden önce parola ile yeniden doğrulama gerekir.")
        password.tap()
        password.typeText(e2ePassword)
        app.buttons["account-delete-confirm"].tap()
        XCTAssertTrue(e2eField(app, "auth-email-field").waitForExistence(timeout: 30),
                      "Hesap silme (deleteAccount callable) başarısız: \(e2eMessageText(app))")
        capture(app, name: "e2e-account-deleted")
        if fixtureEnabled {
            let verified = try await simulatorFixture("verify-deletion")
            XCTAssertEqual(verified["authDeleted"], "true")
            XCTAssertEqual(verified["recordsDeleted"], "true")
        }
    }
}
