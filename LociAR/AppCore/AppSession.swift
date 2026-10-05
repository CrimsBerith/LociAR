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

    private(set) var phase: Phase = .loading {
        didSet {
            guard backendConfigured else { return }
            if !isLocalPreview, case let .signedIn(user) = phase {
                NotificationService.shared.setUser(user.id)
            } else {
                NotificationService.shared.setUser(nil)
            }
        }
    }
    private(set) var backendMessage: String?
    private(set) var isLocalPreview = false
    private let authRepository: any AuthRepository
    private let backendConfigured: Bool
    @ObservationIgnored private var operationGeneration = 0
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
        let generation = operationGeneration
        let user = await authRepository.currentUser()
        guard !Task.isCancelled, generation == operationGeneration else { return }
        if let user { phase = .signedIn(user) }
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
        operationGeneration += 1
        let generation = operationGeneration
        let result = try await authRepository.signIn(email: email, password: password)
        guard !Task.isCancelled, generation == operationGeneration else { return }
        phase = .signedIn(result)
        backendMessage = nil
    }

    func signUp(email: String, password: String) async throws -> Bool {
        operationGeneration += 1
        let generation = operationGeneration
        let result = try await authRepository.signUp(
            email: email,
            password: password,
            redirectTo: URL(string: "lociar://auth-callback")!
        )
        guard !Task.isCancelled, generation == operationGeneration else { return result.requiresEmailConfirmation }
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
        operationGeneration += 1
        let generation = operationGeneration
        let result = try await authRepository.updatePassword(password)
        guard !Task.isCancelled, generation == operationGeneration else { return }
        phase = .signedIn(result)
        backendMessage = nil
    }

    func cancelPasswordRecovery() async {
        operationGeneration += 1
        await NotificationService.shared.prepareForSignOut()
        await authRepository.signOut()
        phase = .signedOut
    }

    func sendMagicLink(email: String) async throws {
        try await authRepository.sendMagicLink(email: email, redirectTo: URL(string: "lociar://auth-callback")!)
        backendMessage = String(localized: "Giriş bağlantısı gönderildi.")
    }

    func verifyEmailOTP(email: String, code: String) async throws {
        operationGeneration += 1
        let generation = operationGeneration
        let result = try await authRepository.verifyEmailOTP(email: email, code: code)
        guard !Task.isCancelled, generation == operationGeneration else { return }
        phase = .signedIn(result)
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
        guard case let .signedIn(startedUser) = phase else { throw AuthFlowError.notSignedIn }
        let generation = operationGeneration
        let updated = try await authRepository.updateProfile(handle: handle, avatar: avatar)
        try Task.checkCancellation()
        guard generation == operationGeneration, case let .signedIn(current) = phase,
              current.id == startedUser.id, updated.id == startedUser.id else { throw AuthFlowError.notSignedIn }
        phase = .signedIn(updated)
    }

    func resendVerificationEmail(email: String) async throws {
        if isLocalPreview {
            backendMessage = String(localized: "Doğrulama e-postası yeniden gönderildi (Önizleme).")
            return
        }
        try await authRepository.resendVerificationEmail(email: email)
        backendMessage = String(localized: "Doğrulama e-postası yeniden gönderildi.")
    }

    func handleOpenURL(_ url: URL) async {
        operationGeneration += 1
        let generation = operationGeneration
        guard Self.isAllowedAuthCallback(url) else {
            backendMessage = String(localized: "Geçersiz veya desteklenmeyen giriş bağlantısı.")
            return
        }
        do {
            if let user = try await authRepository.completeAuthCallback(url) {
                guard !Task.isCancelled, generation == operationGeneration else { return }
                phase = url.host == "password-reset" ? .passwordRecovery(user) : .signedIn(user)
            }
            else if generation == operationGeneration { phase = .signedOut }
        } catch let error as AuthFlowError {
            guard generation == operationGeneration else { return }
            backendMessage = error.localizedDescription
            phase = .signedOut
        } catch {
            guard generation == operationGeneration else { return }
            backendMessage = String(localized: "Giriş bağlantısı tamamlanamadı. Bağlantını kontrol edip tekrar dene.")
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
        operationGeneration += 1
        let generation = operationGeneration
        let result = try await authRepository.signInWithApple(identityToken: identityToken, nonce: nonce, fullName: fullName)
        guard !Task.isCancelled, generation == operationGeneration else { return }
        phase = .signedIn(result)
    }

#if DEBUG
    func continueInDevicePreview() {
        isLocalPreview = true
        backendMessage = String(localized: "Cihaz test modu açık. Sunucu işlemleri bağlantı yeniden kurulana kadar yerel tutulur.")
        phase = .signedIn(UITestFixtures.creator)
    }
#endif

    func signOut() async {
        operationGeneration += 1
        let shouldSignOutRemotely = !isLocalPreview
        if shouldSignOutRemotely { await NotificationService.shared.prepareForSignOut() }
        isLocalPreview = false
        if shouldSignOutRemotely { await authRepository.signOut() }
        await AvatarURLCache.shared.clear()
        phase = .signedOut
    }

    func accountDeletionMethod() async throws -> AccountDeletionMethod {
        guard !isLocalPreview, case let .signedIn(user) = phase else { throw AuthFlowError.notSignedIn }
        let method = try await authRepository.accountDeletionMethod()
        guard case let .signedIn(current) = phase, current.id == user.id else { throw AuthFlowError.notSignedIn }
        return method
    }

    func deleteAccount(password: String?) async throws {
        guard !isLocalPreview, case let .signedIn(user) = phase else { throw AuthFlowError.notSignedIn }
        do { try await authRepository.deleteAccount(password: password, expectedUserID: user.id) }
        catch AuthFlowError.deletionPending {
            LocalAccountDeletion.markAccepted(user.id)
            if case let .signedIn(current) = phase, current.id != user.id { throw AuthFlowError.deletionPending }
            phase = .signedOut
            throw AuthFlowError.deletionPending
        }
        LocalAccountDeletion.markAccepted(user.id)
        if case let .signedIn(current) = phase, current.id != user.id { return }
        phase = .signedOut
        await NotificationService.shared.prepareForSignOut()
    }
}
