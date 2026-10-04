import Foundation
import Observation

@MainActor
@Observable
final class AppSession {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn(LociUser)
        case passwordRecovery(LociUser)
    }

    private(set) var phase: Phase = .loading
    private(set) var backendMessage: String?
    private(set) var isLocalPreview = false
    private let authRepository: any AuthRepository
    private let backendConfigured: Bool
    @ObservationIgnored private var authObservationTask: Task<Void, Never>?
    nonisolated private static let allowedCallbackHosts: Set<String> = ["auth-callback", "password-reset"]

    init(authRepository: any AuthRepository, backendConfigured: Bool) {
        self.authRepository = authRepository
        self.backendConfigured = backendConfigured
    }

    func bootstrap() async {
#if DEBUG
        if UITestFixtures.signedOutSessionEnabled {
            isLocalPreview = true
            phase = .signedOut
            return
        }
        if UITestFixtures.authenticatedSessionEnabled {
            isLocalPreview = true
            phase = .signedIn(UITestFixtures.creator)
            return
        }
#endif
        if let user = await authRepository.currentUser() { phase = .signedIn(user) }
        else {
            if !backendConfigured { backendMessage = AppConfiguration.ConfigurationError.missingBackendConfiguration.localizedDescription }
            phase = .signedOut
        }
        startAuthObservationIfNeeded()
    }

    private func startAuthObservationIfNeeded() {
        guard backendConfigured, authObservationTask == nil else { return }
        let repository = authRepository
        authObservationTask = Task { [weak self] in
            let changes = await repository.sessionChanges()
            for await user in changes {
                guard let self, !Task.isCancelled else { return }
                guard !self.isLocalPreview else { continue }
                if case .passwordRecovery = self.phase { continue }
                self.phase = user.map(Phase.signedIn) ?? .signedOut
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        phase = .signedIn(try await authRepository.signIn(email: email, password: password))
        backendMessage = nil
    }

    func signUp(email: String, password: String) async throws -> Bool {
        let result = try await authRepository.signUp(
            email: email,
            password: password,
            redirectTo: URL(string: "lociar://auth-callback")!
        )
        if !result.requiresEmailConfirmation { phase = .signedIn(result.user) }
        backendMessage = nil
        return result.requiresEmailConfirmation
    }

    func requestPasswordReset(email: String) async throws {
        try await authRepository.requestPasswordReset(
            email: email,
            redirectTo: URL(string: "lociar://password-reset")!
        )
    }

    func updateRecoveredPassword(_ password: String) async throws {
        phase = .signedIn(try await authRepository.updatePassword(password))
        backendMessage = nil
    }

    func cancelPasswordRecovery() async {
        await authRepository.signOut()
        phase = .signedOut
    }

    func sendMagicLink(email: String) async throws {
        try await authRepository.sendMagicLink(email: email, redirectTo: URL(string: "lociar://auth-callback")!)
        backendMessage = "Giriş bağlantısı gönderildi."
    }

    func verifyEmailOTP(email: String, code: String) async throws {
        phase = .signedIn(try await authRepository.verifyEmailOTP(email: email, code: code))
        backendMessage = nil
    }

    func updateProfile(handle: String, avatar: AvatarChoice) async throws {
        if isLocalPreview {
            if case var .signedIn(currentUser) = phase {
                currentUser.handle = handle
                if case .preset(let name) = avatar { currentUser.avatarURL = AvatarReference.presetURL(name) }
                phase = .signedIn(currentUser)
            }
            return
        }
        let updated = try await authRepository.updateProfile(handle: handle, avatar: avatar)
        phase = .signedIn(updated)
    }

    func resendVerificationEmail(email: String) async throws {
        if isLocalPreview {
            backendMessage = "Doğrulama e-postası yeniden gönderildi (Önizleme)."
            return
        }
        try await authRepository.resendVerificationEmail(email: email)
        backendMessage = "Doğrulama e-postası yeniden gönderildi."
    }

    func handleOpenURL(_ url: URL) async {
        guard Self.isAllowedAuthCallback(url) else {
            backendMessage = "Geçersiz veya desteklenmeyen giriş bağlantısı."
            return
        }
        do {
            if let user = try await authRepository.completeAuthCallback(url) {
                phase = url.host == "password-reset" ? .passwordRecovery(user) : .signedIn(user)
            }
            else { phase = .signedOut }
        } catch {
            backendMessage = error.localizedDescription
            phase = .signedOut
        }
    }

    nonisolated static func isAllowedAuthCallback(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "lociar"
            && url.user == nil
            && url.password == nil
            && url.port == nil
            && (url.path.isEmpty || url.path == "/")
            && allowedCallbackHosts.contains(url.host?.lowercased() ?? "")
    }

    func acceptAppleCredential(identityToken: String, nonce: String?, fullName: String?) async throws {
        phase = .signedIn(try await authRepository.signInWithApple(identityToken: identityToken, nonce: nonce, fullName: fullName))
    }

#if DEBUG
    func continueInDevicePreview() {
        isLocalPreview = true
        backendMessage = "Cihaz test modu açık. Sunucu işlemleri bağlantı yeniden kurulana kadar yerel tutulur."
        phase = .signedIn(UITestFixtures.creator)
    }
#endif

    func signOut() async {
        let shouldSignOutRemotely = !isLocalPreview
        // The push token is unregistered while the Firebase user is still signed in.
        if shouldSignOutRemotely { await NotificationService.shared.prepareForSignOut() }
        isLocalPreview = false
        phase = .signedOut
        if shouldSignOutRemotely { await authRepository.signOut() }
    }

    func deleteAccount() async throws {
        try await authRepository.deleteAccount()
        await NotificationService.shared.accountDeleted()
        phase = .signedOut
    }
}
