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
        field.tap()
        if let current = field.value as? String, !current.isEmpty, !current.hasPrefix("E-posta"), !current.hasPrefix("Şifre") {
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        }
        field.typeText(text)
    }

    private func e2eAllowSystemAlerts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<3 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 2) else { return }
            for title in ["İzin Ver", "Allow", "Uygulamayı Kullanırken İzin Ver", "Allow While Using App", "Tamam", "OK"] {
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
            if app.buttons["onboarding-finish"].exists { app.buttons["onboarding-finish"].tap(); return }
            if app.buttons["onboarding-next"].exists { app.buttons["onboarding-next"].tap(); continue }
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

        XCTAssertTrue(app.buttons["auth-mode-signup"].waitForExistence(timeout: 10), "Giriş ekranı açılmadı.")
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
        handleField.tap()
        if let current = handleField.value as? String, !current.isEmpty {
            handleField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        }
        handleField.typeText(newHandle)
        app.buttons["profile-edit-save"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", newHandle)).firstMatch
            .waitForExistence(timeout: 15), "Profil güncellemesi (Firestore kuralı) başarısız.")
        capture(app, name: "e2e-profile-edited")
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

    func testEmulator09DeleteAccount() throws {
        guard !e2eEmail.isEmpty else { throw XCTSkip("E2E_EMAIL yok") }
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Profil"].tap()
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
    }
}
