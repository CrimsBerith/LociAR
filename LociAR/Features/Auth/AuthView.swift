import AuthenticationServices
import CryptoKit
import SwiftUI
import UIKit

struct AuthView: View {
    private enum Mode { case signIn, signUp }
    private enum Field { case email, password, confirmation }

    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var forgotEmail = ""
    @State private var showPassword = false
    @State private var showForgotPassword = false
    @State private var isWorking = false
    @State private var isResendingEmail = false
    @State private var unconfirmedEmail: String?
    @State private var message: String?
    @State private var currentNonce: String?
    @AppStorage(TermsConsent.storageKey) private var acceptedTermsVersion = ""
    @FocusState private var focusedField: Field?

    var body: some View {
        ZStack {
            LociTheme.spatialGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    Spacer(minLength: 44)
                    brandHeader
                    authCard
                    if let unconfirmed = unconfirmedEmail {
                        emailVerificationNotice(unconfirmed)
                    }
                    if let message = message ?? session.backendMessage {
                        LociInlineNotice(
                            title: String(localized: "İşlem tamamlanamadı"),
                            message: message,
                            symbol: "exclamationmark.circle.fill",
                            color: .orange
                        )
                    }
                    legalNotice
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordView(email: $forgotEmail)
        }
    }

    private var brandHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(LociTheme.accent.opacity(0.12)).frame(width: 92, height: 92)
                Circle().stroke(LociTheme.accent.opacity(0.22), lineWidth: 1).frame(width: 74, height: 74)
                Image(systemName: "location.viewfinder")
                    .font(.system(size: 41, weight: .semibold))
                    .foregroundStyle(LociTheme.accent)
            }
            .accessibilityHidden(true)
            VStack(spacing: 6) {
                Text("LociAR").font(.largeTitle.bold())
                Text("Gerçek mekânlara bağlı hikâyeler.")
                    .foregroundStyle(LociTheme.secondaryText)
            }
        }
    }

    @ViewBuilder
    private var legalNotice: some View {
        VStack(spacing: 7) {
            Button {
                acceptedTermsVersion = termsAccepted ? "" : TermsConsent.currentVersion
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: termsAccepted ? "checkmark.square.fill" : "square")
                        .font(.title3)
                        .foregroundStyle(termsAccepted ? LociTheme.accent : .white)
                    Text("Gizlilik politikasını ve topluluk kurallarını okudum, kabul ediyorum. Sakıncalı içerik ve kötüye kullanıma sıfır tolerans uygulanır.")
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(termsAccepted ? [.isButton, .isSelected] : .isButton)
            .accessibilityIdentifier("auth-terms-consent")
            HStack(spacing: 8) {
                if let url = container.configuration.privacyPolicyURL {
                    Link("Gizlilik", destination: url)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("auth-privacy")
                }
                if let url = container.configuration.termsURL {
                    Link("Koşullar", destination: url)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("auth-terms")
                }
                if let url = container.configuration.supportURL {
                    Link("Destek", destination: url)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("auth-support")
                }
            }
            .fontWeight(.semibold)
        }
        .font(.caption)
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
    }

    private var authCard: some View {
        LociCard {
            VStack(spacing: 14) {
                modeControl

                if container.configuration.appleAuthEnabled {
                    appleButton
                    HStack(spacing: 12) {
                        Rectangle().fill(LociTheme.hairline).frame(height: 1)
                        Text("veya").font(.caption).foregroundStyle(.white)
                        Rectangle().fill(LociTheme.hairline).frame(height: 1)
                    }
                }

                TextField("E-posta", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .submitLabel(.next)
                    .focused($focusedField, equals: .email)
                    .onSubmit { focusedField = .password }
                    .authFieldStyle()
                    .accessibilityIdentifier("auth-email-field")

                HStack(spacing: 8) {
                    Group {
                        if showPassword {
                            TextField("Şifre", text: $password)
                        } else {
                            SecureField("Şifre", text: $password)
                        }
                    }
                    .textContentType(mode == .signUp ? .newPassword : .password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(mode == .signUp ? .next : .go)
                    .onSubmit {
                        if mode == .signUp { focusedField = .confirmation }
                        else if canSubmit { Task { await submit() } }
                    }
                    .accessibilityIdentifier("auth-password-field")

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(showPassword ? String(localized: "Şifreyi gizle") : String(localized: "Şifreyi göster"))
                }
                .authFieldStyle()

                if mode == .signUp {
                    SecureField("Şifreyi tekrar yaz", text: $passwordConfirmation)
                        .textContentType(.newPassword)
                        .focused($focusedField, equals: .confirmation)
                        .submitLabel(.go)
                        .onSubmit { if canSubmit { Task { await submit() } } }
                        .authFieldStyle()
                        .accessibilityIdentifier("auth-confirm-password-field")

                    VStack(alignment: .leading, spacing: 6) {
                        Label("En az 8 karakter", systemImage: password.count >= 8 ? "checkmark.circle.fill" : "circle")
                        if !passwordConfirmation.isEmpty {
                            Label(passwordsMatch ? String(localized: "Şifreler eşleşiyor") : String(localized: "Şifreler farklı"), systemImage: passwordsMatch ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(password.count >= 8 && passwordsMatch ? LociTheme.accent : .secondary)
                }

                Button {
                    Task { await submit() }
                } label: {
                    if isWorking {
                        ProgressView().tint(.black)
                    } else {
                        Text(mode == .signIn ? String(localized: "Giriş yap") : String(localized: "Hesap oluştur"))
                    }
                }
                .buttonStyle(LociPrimaryButtonStyle())
                .disabled(!canSubmit || isWorking)
                .accessibilityIdentifier("auth-email-submit")

                if mode == .signIn {
                    HStack(spacing: 16) {
                        Button {
                            forgotEmail = email
                            showForgotPassword = true
                        } label: {
                            Text("Şifremi unuttum")
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityIdentifier("auth-forgot-password")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LociTheme.accent)
                } else {
                    Text("Kayıttan sonra e-posta adresine gönderilen bağlantıyla hesabını doğrula.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                #if DEBUG
                if !UITestFixtures.signedOutSessionEnabled {
                    Button {
                        session.continueInDevicePreview()
                    } label: {
                        Label("Giriş Yapmadan Test Et (Önizleme)", systemImage: "play.circle.fill")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                            .foregroundStyle(LociTheme.accent)
                    }
                    .buttonStyle(.bordered)
                    .tint(LociTheme.accent)
                    .accessibilityIdentifier("auth-device-preview")
                }
                #endif
            }
        }
    }

    private var modeControl: some View {
        HStack(spacing: 4) {
            modeButton("Giriş yap", value: .signIn, identifier: "auth-mode-signin")
            modeButton("Kayıt ol", value: .signUp, identifier: "auth-mode-signup")
        }
        .padding(4)
        .background(LociTheme.elevated, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func modeButton(_ title: String, value: Mode, identifier: String) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.18)) {
                mode = value
                message = nil
                password = ""
                passwordConfirmation = ""
            }
        } label: {
            Text(title.localizedUI)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
                .background(mode == value ? LociTheme.surface : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(mode == value ? Color.white : LociTheme.secondaryText)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private var appleButton: some View {
        ConsentAppleSignInButton(type: mode == .signUp ? .signUp : .signIn, enabled: termsAccepted) { request in
            let nonce = Nonce.make()
            currentNonce = nonce
            request.requestedScopes = [.email, .fullName]
            request.nonce = Nonce.sha256(nonce)
        } onCompletion: { result in
            guard case .success(let authorization) = result,
                  let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                message = String(localized: "Apple ile giriş tamamlanamadı.")
                return
            }
            let fullName = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
            Task { await authenticateApple(token: token, fullName: fullName) }
        }
        .id(mode == .signUp)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        // Apple sign-in can create an account, so it also needs the consent checkbox.
        .disabled(!termsAccepted)
        .opacity(termsAccepted ? 1 : 0.5)
        .accessibilityIdentifier("auth-apple")
    }

    private var isEmailValid: Bool {
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = clean.firstIndex(of: "@"), at != clean.startIndex else { return false }
        return clean[clean.index(after: at)...].contains(".")
    }

    private var passwordsMatch: Bool { password == passwordConfirmation }
    private var termsAccepted: Bool { acceptedTermsVersion == TermsConsent.currentVersion }
    private var canSubmit: Bool {
        isEmailValid && password.count >= 8 && termsAccepted
            && (mode == .signIn || (!passwordConfirmation.isEmpty && passwordsMatch))
    }

    private func submit() async {
        isWorking = true
        message = nil
        defer { isWorking = false }
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            switch mode {
            case .signIn:
                try await session.signIn(email: cleanEmail, password: password)
            case .signUp:
                let confirmationRequired = try await session.signUp(email: cleanEmail, password: password)
                if confirmationRequired {
                    mode = .signIn
                    unconfirmedEmail = cleanEmail
                    password = ""
                    passwordConfirmation = ""
                    message = String(localized: "Hesabın oluşturuldu. E-postandaki doğrulama bağlantısına dokun, ardından giriş yap.")
                }
            }
        } catch AuthFlowError.emailNotVerified {
            unconfirmedEmail = cleanEmail
            message = AuthFlowError.emailNotVerified.localizedDescription
        } catch {
            let text = mode == .signIn
                ? String(localized: "Giriş yapılamadı. E-posta ve şifreni kontrol et.")
                : String(localized: "Hesap oluşturulamadı. E-posta kullanımda olabilir veya şifre yeterince güçlü değil.")
#if DEBUG
            // Surface the real cause while testing against the emulator; never in release.
            let nsError = error as NSError
            message = text + "\n[DEBUG] \(nsError.domain) \(nsError.code): \(error.localizedDescription)"
            print("[LociAR auth] \(mode) failed: \(error)")
#else
            message = text
#endif
        }
    }

    private func emailVerificationNotice(_ targetEmail: String) -> some View {
        LociCard {
            VStack(spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "envelope.badge.shield.half.filled")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(LociTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("E-posta Doğrulaması")
                            .font(.subheadline.bold())
                        Text(String(localized: "\(targetEmail) adresine doğrulama bağlantısı gönderildi."))
                            .font(.caption)
                            .foregroundStyle(LociTheme.secondaryText)
                    }
                    Spacer()
                }
                HStack {
                    Button {
                        Task { await resendEmail(targetEmail) }
                    } label: {
                        if isResendingEmail {
                            ProgressView().tint(LociTheme.accent)
                        } else {
                            Label("Tekrar Gönder", systemImage: "arrow.clockwise")
                                .font(.caption.weight(.semibold))
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(LociTheme.accent)
                    .disabled(isResendingEmail)

                    Spacer()

                    Button("Kapat") {
                        withAnimation { unconfirmedEmail = nil }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func resendEmail(_ targetEmail: String) async {
        guard !isResendingEmail else { return }
        isResendingEmail = true
        defer { isResendingEmail = false }
        do {
            try await session.resendVerificationEmail(email: targetEmail)
            message = String(localized: "Doğrulama bağlantısı tekrar gönderildi.")
        } catch {
            message = String(localized: "E-posta gönderilemedi. Lütfen biraz sonra tekrar deneyin.")
        }
    }

    private func authenticateApple(token: String, fullName: String?) async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await session.acceptAppleCredential(identityToken: token, nonce: currentNonce, fullName: fullName)
        } catch {
            message = String(localized: "Apple ile giriş şu anda tamamlanamadı. Tekrar dene.")
        }
    }
}

/// Keep Apple's native button and authorization flow; expose its disabled state to VoiceOver.
private struct ConsentAppleSignInButton: UIViewRepresentable {
    let type: ASAuthorizationAppleIDButton.ButtonType
    let enabled: Bool
    let onRequest: (ASAuthorizationAppleIDRequest) -> Void
    let onCompletion: (Result<ASAuthorization, Error>) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> AccessibleAppleIDButton {
        let button = AccessibleAppleIDButton(type: type, style: .white)
        button.accessibilityIdentifier = "auth-apple"
        button.addTarget(context.coordinator, action: #selector(Coordinator.signIn), for: .touchUpInside)
        context.coordinator.button = button
        return button
    }

    func updateUIView(_ button: AccessibleAppleIDButton, context: Context) {
        context.coordinator.parent = self
        button.isEnabled = enabled
    }

    final class AccessibleAppleIDButton: ASAuthorizationAppleIDButton {
        override var accessibilityTraits: UIAccessibilityTraits {
            get {
                var traits = super.accessibilityTraits
                if !isEnabled { traits.insert(.notEnabled) }
                return traits
            }
            set { super.accessibilityTraits = newValue }
        }
    }

    final class Coordinator: NSObject, ASAuthorizationControllerDelegate,
        ASAuthorizationControllerPresentationContextProviding {
        var parent: ConsentAppleSignInButton
        weak var button: AccessibleAppleIDButton?
        private var controller: ASAuthorizationController?
        private var window: UIWindow?

        init(_ parent: ConsentAppleSignInButton) { self.parent = parent }

        @objc func signIn() {
            guard parent.enabled, controller == nil, let window = button?.window else { return }
            self.window = window
            let request = ASAuthorizationAppleIDProvider().createRequest()
            parent.onRequest(request)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.controller = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }

        func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            window ?? ASPresentationAnchor()
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
            self.controller = nil
            window = nil
            parent.onCompletion(.success(authorization))
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            self.controller = nil
            window = nil
            parent.onCompletion(.failure(error))
        }
    }
}

struct PasswordRecoveryView: View {
    @Environment(AppSession.self) private var session
    @State private var password = ""
    @State private var confirmation = ""
    @State private var isWorking = false
    @State private var message: String?

    var body: some View {
        ZStack {
            LociTheme.spatialGradient.ignoresSafeArea()
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "lock.rotation").font(.system(size: 44)).foregroundStyle(LociTheme.accent)
                Text("Yeni şifre oluştur").font(.title2.bold())
                Text("Hesabın için en az 8 karakterli yeni bir şifre belirle.")
                    .foregroundStyle(.secondary).multilineTextAlignment(.center)
                LociCard {
                    VStack(spacing: 12) {
                        SecureField("Yeni şifre", text: $password).textContentType(.newPassword).authFieldStyle()
                        SecureField("Yeni şifreyi tekrar yaz", text: $confirmation).textContentType(.newPassword).authFieldStyle()
                        Button("Şifreyi güncelle") { Task { await updatePassword() } }
                            .font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                            .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
                            .disabled(isWorking || password.count < 8 || password != confirmation)
                            .accessibilityIdentifier("auth-password-update")
                    }
                }
                if let message { Text(message.localizedUI).font(.footnote).foregroundStyle(.secondary) }
                Button("Giriş ekranına dön") { Task { await session.cancelPasswordRecovery() } }
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(24)
        }
    }

    private func updatePassword() async {
        isWorking = true
        defer { isWorking = false }
        do { try await session.updateRecoveredPassword(password) }
        catch { message = String(localized: "Şifre güncellenemedi. Kurtarma bağlantısını yeniden iste.") }
    }
}

private struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session
    @Binding var email: String
    @State private var isWorking = false
    @State private var sent = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: sent ? "envelope.badge.fill" : "key.horizontal.fill")
                    .font(.system(size: 38)).foregroundStyle(LociTheme.accent)
                Text(sent ? String(localized: "E-postanı kontrol et") : String(localized: "Şifreni yenile"))
                    .font(.title2.bold())
                Text(sent
                     ? String(localized: "Şifre yenileme bağlantısını gönderdik. Bağlantı LociAR’da yeni şifre ekranını açacak.")
                     : String(localized: "Hesabında kullandığın e-posta adresini yaz."))
                    .foregroundStyle(.secondary)

                if !sent {
                    TextField("E-posta", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress).textContentType(.emailAddress)
                        .authFieldStyle().accessibilityIdentifier("auth-reset-email")
                    Button {
                        Task { await send() }
                    } label: {
                        if isWorking { ProgressView().frame(maxWidth: .infinity, minHeight: 48) }
                        else { Text("Yenileme bağlantısı gönder").frame(maxWidth: .infinity, minHeight: 48) }
                    }
                    .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
                    .disabled(isWorking || !email.contains("@"))
                    .accessibilityIdentifier("auth-reset-submit")
                } else {
                    Button("Tamam") { dismiss() }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
                }
                if let message { Text(message.localizedUI).font(.footnote).foregroundStyle(.orange) }
                Spacer()
            }
            .padding(24)
            .background(LociScreenBackground())
            .navigationTitle("Şifremi unuttum")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func send() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await session.requestPasswordReset(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
            sent = true
        } catch { message = String(localized: "Bağlantı gönderilemedi. E-posta adresini ve bağlantını kontrol et.") }
    }
}

private extension View {
    func authFieldStyle() -> some View {
        padding(14)
            .background(LociTheme.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Sign in with Apple nonce (also used by AppleReauthenticator for account deletion).
enum Nonce {
    static func make(length: Int = 32) -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in characters.randomElement(using: &generator)! })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
