import AuthenticationServices
import CryptoKit
import Foundation
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseFirestore
@preconcurrency import FirebaseFunctions
@preconcurrency import FirebaseStorage
import UIKit

protocol AuthRepository: Sendable {
    func currentUser() async -> LociUser?
    func sessionChanges() async -> AsyncStream<LociUser?>
    func signIn(email: String, password: String) async throws -> LociUser
    func signUp(email: String, password: String, redirectTo: URL) async throws -> AuthSignUpResult
    func requestPasswordReset(email: String, redirectTo: URL) async throws
    func updatePassword(_ password: String) async throws -> LociUser
    func updateProfile(handle: String, avatar: AvatarChoice) async throws -> LociUser
    func resendVerificationEmail(email: String) async throws
    func sendMagicLink(email: String, redirectTo: URL) async throws
    func verifyEmailOTP(email: String, code: String) async throws -> LociUser
    func completeAuthCallback(_ url: URL) async throws -> LociUser?
    func signInWithApple(identityToken: String, nonce: String?, fullName: String?) async throws -> LociUser
    func signOut() async
    func accountDeletionMethod() async throws -> AccountDeletionMethod
    func deleteAccount(password: String?, expectedUserID: UUID) async throws
}

struct AuthSignUpResult: Sendable {
    let user: LociUser
    let requiresEmailConfirmation: Bool
}

enum AccountDeletionMethod: Equatable, Sendable {
    case apple
    case password

    static func resolve(providerIDs: [String], email: String?) throws -> Self {
        // Linked Apple accounts must also revoke the Apple grant.
        if providerIDs.contains("apple.com") { return .apple }
        if providerIDs.contains("password"), let email, !email.isEmpty { return .password }
        throw AuthFlowError.unsupported
    }
}

enum AuthFlowError: LocalizedError, Sendable {
    case emailNotVerified
    case notSignedIn
    case unsupported
    case invalidHandle
    case handleTaken
    case handleNotAllowed
    case handleCooldown
    case reauthRequired
    case invalidPhoto
    case photoRateLimited
    case appleReauthenticationRequired
    case appleRevocationFailed
    case passwordRequired
    case invalidDeletionCredential
    case reauthenticationCancelled
    case deletionPending

    var errorDescription: String? {
        switch self {
        case .emailNotVerified:
            String(localized: "E-posta adresin henüz doğrulanmadı. Gelen kutundaki bağlantıya dokunduktan sonra tekrar giriş yap.")
        case .notSignedIn:
            String(localized: "Oturum bulunamadı. Lütfen tekrar giriş yap.")
        case .unsupported:
            String(localized: "Bu giriş yöntemi artık desteklenmiyor. E-posta ve şifre ya da Apple ile giriş yap.")
        case .invalidHandle:
            String(localized: "Kullanıcı adı 3–30 karakter olmalı; yalnızca küçük harf, rakam, alt çizgi ve nokta içerebilir.")
        case .handleTaken:
            String(localized: "Bu kullanıcı adı başka biri tarafından kullanılıyor. Farklı bir ad dene.")
        case .handleNotAllowed:
            String(localized: "Bu kullanıcı adı kullanılamaz. Farklı bir ad dene.")
        case .handleCooldown:
            String(localized: "Kullanıcı adını en fazla 30 günde bir değiştirebilirsin.")
        case .reauthRequired:
            String(localized: "Güvenlik için hesabı silmeden önce yeniden doğrulama gerekiyor.")
        case .invalidPhoto:
            String(localized: "Fotoğraf hazırlanamadı. Farklı bir fotoğraf dene.")
        case .photoRateLimited:
            String(localized: "Çok sık fotoğraf yükledin. Bir saat sonra tekrar dene.")
        case .appleReauthenticationRequired:
            String(localized: "Hesabı silmek için Apple ile yeniden doğrulama gerekiyor.")
        case .appleRevocationFailed:
            String(localized: "Apple oturum izni geri alınamadı, hesabın silinmedi. Biraz sonra tekrar dene.")
        case .passwordRequired:
            String(localized: "Hesabı silmek için mevcut parolanı gir.")
        case .invalidDeletionCredential:
            String(localized: "Kimlik doğrulanamadı. Hesabın silinmedi; bilgilerini kontrol et.")
        case .reauthenticationCancelled:
            String(localized: "Kimlik doğrulama iptal edildi. Hesabın silinmedi.")
        case .deletionPending:
            String(localized: "Silme isteğiniz alındı. İşlem arka planda tamamlanacak.")
        }
    }
}

/// Firebase Authentication. A Firebase session whose email is not verified yet is kept
/// (so verification mail can be re-sent) but is never surfaced to the app as signed in.
final class FirebaseAuthRepository: AuthRepository, @unchecked Sendable {
    private let callables: CallableClient
    private let userCacheLock = NSLock()
    private var hydratedUsers: [String: LociUser] = [:]

    init(functionsRegion: String) {
        callables = CallableClient(region: functionsRegion)
    }

    private struct EnsureProfileResponse: Decodable, Sendable {
        let luid: String
        let handle: String
        let avatarURL: String?
        let avatarPreset: String?
        let claimsUpdated: Bool
    }

    private struct EnsureProfilePayload: Encodable, Sendable {
        let userId: String
        let displayName: String?
    }

    nonisolated private static func isVerified(_ user: User) -> Bool {
        if user.isEmailVerified { return true }
        return user.providerData.contains { $0.providerID == "apple.com" }
    }

    nonisolated private static func domainUser(_ user: User, handle: String? = nil, avatarURL: URL? = nil) -> LociUser {
        let fallbackHandle = user.email?.components(separatedBy: "@").first ?? "loci"
        // Auth's photoURL is deliberately ignored: only server-screened avatars are shown.
        return LociUser(
            id: FirebaseIdentity.luid(forFirebaseUID: user.uid),
            handle: handle ?? user.displayName.flatMap { $0.isEmpty ? nil : $0 } ?? fallbackHandle,
            avatarURL: avatarURL,
            email: user.email
        )
    }

    /// Server-authoritative profile bootstrap: the `ensureProfile` callable creates
    /// `profiles/{luid}` + `users_private/{luid}` and sets the `luid` custom claim that
    /// Firestore/Storage rules rely on. Clients can never write these documents directly.
    private func establish(_ user: User, displayName: String? = nil) async throws -> LociUser {
        try Self.assertSession(user)
        let response: EnsureProfileResponse = try await callables.call(
            "ensureProfile",
            payload: EnsureProfilePayload(userId: FirebaseIdentity.key(FirebaseIdentity.luid(forFirebaseUID: user.uid)), displayName: displayName)
        )
        if response.claimsUpdated {
            _ = try await user.getIDTokenResult(forcingRefresh: true)
        }
        try Self.assertSession(user)
        let avatar = await AvatarReference.resolve(avatarURL: response.avatarURL, preset: response.avatarPreset)
        try Self.assertSession(user)
        if user.displayName != response.handle {
            let change = user.createProfileChangeRequest()
            change.displayName = response.handle
            try? await change.commitChanges()
        }
        let hydrated = Self.domainUser(user, handle: response.handle, avatarURL: avatar)
        userCacheLock.withLock { hydratedUsers[user.uid] = hydrated }
        return hydrated
    }

    nonisolated private static func assertSession(_ user: User) throws {
        try Task.checkCancellation()
        guard Auth.auth().currentUser?.uid == user.uid else { throw AuthFlowError.notSignedIn }
    }

    func currentUser() async -> LociUser? {
        guard let user = Auth.auth().currentUser else { return nil }
        try? await user.reload()
        guard let refreshed = Auth.auth().currentUser, refreshed.uid == user.uid, Self.isVerified(refreshed) else { return nil }
        if let established = try? await establish(refreshed) { return established }
        // Offline launch: fall back to cached Auth profile; claims are refreshed on next launch.
        guard Auth.auth().currentUser?.uid == refreshed.uid else { return nil }
        return userCacheLock.withLock { hydratedUsers[refreshed.uid] } ?? Self.domainUser(refreshed)
    }

    func sessionChanges() async -> AsyncStream<LociUser?> {
        AsyncStream { continuation in
            let box = ListenerBox()
            box.handle = Auth.auth().addStateDidChangeListener { _, user in
                guard let user else {
                    box.replaceTask(nil)
                    continuation.yield(nil)
                    return
                }
                box.replaceTask(nil)
                guard Self.isVerified(user) else { continuation.yield(nil); return }
                box.replaceTask(Task {
                    let hydrated = try? await self.establish(user)
                    guard !Task.isCancelled, Auth.auth().currentUser?.uid == user.uid else { return }
                    continuation.yield(hydrated ?? self.userCacheLock.withLock { self.hydratedUsers[user.uid] } ?? Self.domainUser(user))
                })
            }
            continuation.onTermination = { _ in
                box.replaceTask(nil)
                if let handle = box.handle { Auth.auth().removeStateDidChangeListener(handle) }
            }
        }
    }

    func signIn(email: String, password: String) async throws -> LociUser {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        let user = result.user
        guard Self.isVerified(user) else {
            try? await user.sendEmailVerification()
            throw AuthFlowError.emailNotVerified
        }
        return try await establish(user)
    }

    func signUp(email: String, password: String, redirectTo: URL) async throws -> AuthSignUpResult {
        _ = redirectTo // Firebase hosts the verification page; no deep link is needed.
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        try await result.user.sendEmailVerification()
        return AuthSignUpResult(user: Self.domainUser(result.user), requiresEmailConfirmation: true)
    }

    func requestPasswordReset(email: String, redirectTo: URL) async throws {
        _ = redirectTo // Firebase's hosted page lets the user choose a new password.
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }

    func updatePassword(_ password: String) async throws -> LociUser {
        guard let user = Auth.auth().currentUser else { throw AuthFlowError.notSignedIn }
        try await user.updatePassword(to: password)
        return Self.domainUser(user)
    }

    /// Handles change through the `updateHandle` callable (server-side uniqueness). Presets are
    /// written directly (rules allow only the preset list); photos go to `avatars/<luid>/pending/`
    /// and appear once the server has screened them.
    func updateProfile(handle: String, avatar: AvatarChoice) async throws -> LociUser {
        guard let user = Auth.auth().currentUser else { throw AuthFlowError.notSignedIn }
        let clean = handle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard clean.range(of: "^[a-z0-9_.]{3,30}$", options: .regularExpression) != nil else {
            throw AuthFlowError.invalidHandle
        }
        let luid = FirebaseIdentity.key(FirebaseIdentity.luid(forFirebaseUID: user.uid))

        if clean != user.displayName {
            struct Payload: Encodable, Sendable { let userId: String; let handle: String }
            struct Response: Decodable, Sendable { let handle: String }
            do {
                let _: Response = try await callables.call("updateHandle", payload: Payload(userId: luid, handle: clean))
            } catch BackendCallError.rejected(let code, _, let reason) where reason == "handle_taken" || code == FunctionsErrorCode.alreadyExists.rawValue {
                throw AuthFlowError.handleTaken
            } catch BackendCallError.rejected(_, _, let reason) where reason == "handle_reserved" || reason == "handle_not_allowed" {
                throw AuthFlowError.handleNotAllowed
            } catch BackendCallError.rejected(_, _, let reason) where reason == "handle_cooldown" {
                throw AuthFlowError.handleCooldown
            }
        }

        try Self.assertSession(user)
        switch avatar {
        case .unchanged:
            break
        case .preset(let name):
            guard AvatarReference.presets.contains(name) else { throw AuthFlowError.invalidPhoto }
            try await Firestore.firestore().collection("profiles").document(luid).updateData([
                "avatar_preset": name,
                "avatar_url": NSNull(),
                "updated_at": FieldValue.serverTimestamp(),
            ])
        case .photo(let data):
            guard let jpeg = AvatarReference.preparedJPEG(from: data) else { throw AuthFlowError.invalidPhoto }
            // Every upload needs a slot from the server (hourly quota); Storage rules check it.
            struct EmptyPayload: Encodable, Sendable { let userId: String }
            struct SlotResponse: Decodable, Sendable { let objectId: String }
            let slot: SlotResponse
            do {
                slot = try await callables.call("beginAvatarUpload", payload: EmptyPayload(userId: luid))
            } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
                throw AuthFlowError.photoRateLimited
            }
            try Self.assertSession(user)
            let metadata = StorageMetadata()
            metadata.contentType = "image/jpeg"
            let path = "avatars/\(luid)/pending/\(slot.objectId).jpg"
            _ = try await Storage.storage().reference(withPath: path).putDataAsync(jpeg, metadata: metadata)
            // Screening runs server-side in a callable (no Storage trigger / extra IAM needed).
            struct ScreenPayload: Encodable, Sendable { let userId: String; let objectId: String }
            struct ScreenResponse: Decodable, Sendable { let status: String }
            let screened: ScreenResponse = try await callables.call("screenAvatar", payload: ScreenPayload(userId: luid, objectId: slot.objectId))
            if screened.status == "rejected" { throw AuthFlowError.invalidPhoto }
        }
        try Self.assertSession(user)
        return try await establish(user)
    }

    func resendVerificationEmail(email: String) async throws {
        guard let user = Auth.auth().currentUser,
              user.email?.caseInsensitiveCompare(email) == .orderedSame else { throw AuthFlowError.notSignedIn }
        try await user.sendEmailVerification()
    }

    func sendMagicLink(email: String, redirectTo: URL) async throws { throw AuthFlowError.unsupported }

    func verifyEmailOTP(email: String, code: String) async throws -> LociUser { throw AuthFlowError.unsupported }

    func completeAuthCallback(_ url: URL) async throws -> LociUser? {
        // Legacy lociar:// auth links are no longer issued; keep whatever session exists.
        await currentUser()
    }

    func signInWithApple(identityToken: String, nonce: String?, fullName: String?) async throws -> LociUser {
        let credential = OAuthProvider.appleCredential(withIDToken: identityToken, rawNonce: nonce, fullName: nil)
        let result = try await Auth.auth().signIn(with: credential)
        let name = fullName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await establish(result.user, displayName: (name?.isEmpty ?? true) ? nil : name)
    }

    func signOut() async {
        userCacheLock.withLock { hydratedUsers.removeAll() }
        try? Auth.auth().signOut()
    }

    @MainActor
    func accountDeletionMethod() async throws -> AccountDeletionMethod {
        guard let user = Auth.auth().currentUser else { throw AuthFlowError.notSignedIn }
        return try AccountDeletionMethod.resolve(providerIDs: user.providerData.map(\.providerID), email: user.email)
    }

    @MainActor
    func deleteAccount(password: String?, expectedUserID: UUID) async throws {
        guard let user = Auth.auth().currentUser else { throw AuthFlowError.notSignedIn }
        guard FirebaseIdentity.luid(forFirebaseUID: user.uid) == expectedUserID else { throw AuthFlowError.notSignedIn }
        let method = try AccountDeletionMethod.resolve(providerIDs: user.providerData.map(\.providerID), email: user.email)
        let client = FirebaseAccountDeletionClient(user: user, method: method, callables: callables)
        do { try await AccountDeletionFlow.run(client: client, password: password) }
        catch AuthFlowError.deletionPending {
            if Auth.auth().currentUser?.uid == user.uid { try? Auth.auth().signOut() }
            throw AuthFlowError.deletionPending
        }
        if Auth.auth().currentUser?.uid == user.uid { try? Auth.auth().signOut() }
    }
}

@MainActor
protocol AccountDeletionClient: AnyObject {
    var method: AccountDeletionMethod { get }
    func assertCurrentSession() throws
    func reauthenticate(password: String?) async throws -> String?
    func refreshSession() async throws
    func delete(appleAuthorizationCode: String?) async throws
}

/// No delete request is made until reauthentication and token refresh succeed for the same user.
@MainActor
enum AccountDeletionFlow {
    static func run(client: any AccountDeletionClient, password: String?) async throws {
        try client.assertCurrentSession()
        if client.method == .password, password?.isEmpty != false { throw AuthFlowError.passwordRequired }
        try Task.checkCancellation()
        let appleCode = try await client.reauthenticate(password: password)
        try Task.checkCancellation()
        try client.assertCurrentSession()
        try await client.refreshSession()
        try Task.checkCancellation()
        try client.assertCurrentSession()
        try await client.delete(appleAuthorizationCode: appleCode)
    }
}

@MainActor
private final class FirebaseAccountDeletionClient: AccountDeletionClient {
    private let user: User
    let method: AccountDeletionMethod
    private let callables: CallableClient
    init(user: User, method: AccountDeletionMethod, callables: CallableClient) {
        self.user = user; self.method = method; self.callables = callables
    }

    func assertCurrentSession() throws {
        guard Auth.auth().currentUser?.uid == user.uid else { throw AuthFlowError.notSignedIn }
    }

    func reauthenticate(password: String?) async throws -> String? {
        let credential: AuthCredential
        let appleCode: String?
        switch method {
        case .apple:
            let authorization = try await AppleReauthenticator.credential()
            try Task.checkCancellation()
            try assertCurrentSession()
            credential = OAuthProvider.appleCredential(withIDToken: authorization.identityToken, rawNonce: authorization.rawNonce, fullName: nil)
            appleCode = authorization.authorizationCode
        case .password:
            guard let email = user.email, let password, !password.isEmpty else { throw AuthFlowError.passwordRequired }
            credential = EmailAuthProvider.credential(withEmail: email, password: password)
            appleCode = nil
        }
        do { _ = try await user.reauthenticate(with: credential) }
        catch {
            let code = AuthErrorCode(rawValue: (error as NSError).code)
            if code == .wrongPassword || code == .invalidCredential || code == .userMismatch {
                throw AuthFlowError.invalidDeletionCredential
            }
            throw error
        }
        return appleCode
    }

    func refreshSession() async throws { _ = try await user.getIDTokenResult(forcingRefresh: true) }

    func delete(appleAuthorizationCode: String?) async throws {
        struct Response: Decodable, Sendable { let ok: Bool }
        struct Payload: Encodable, Sendable { let appleAuthorizationCode: String?; let userId: String }
        let response: Response
        do {
            response = try await callables.call("deleteAccount", payload: Payload(
                appleAuthorizationCode: appleAuthorizationCode, userId: FirebaseIdentity.luid(forFirebaseUID: user.uid).uuidString.lowercased()
            ), timeout: 300)
        } catch BackendCallError.rejected(_, _, let reason) where reason == "reauth_required" {
            throw AuthFlowError.reauthRequired
        } catch BackendCallError.rejected(_, _, let reason) where reason == "apple_revoke_failed" || reason == "apple_revoke_unavailable" {
            throw AuthFlowError.appleRevocationFailed
        } catch BackendCallError.rejected(_, _, let reason) where reason == "deletion_pending" {
            throw AuthFlowError.deletionPending
        }
        guard response.ok else { throw BackendCallError.invalidResponse }
    }
}

private final class ListenerBox: @unchecked Sendable {
    var handle: AuthStateDidChangeListenerHandle?
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    func replaceTask(_ next: Task<Void, Never>?) {
        lock.withLock { task?.cancel(); task = next }
    }
}

struct AppleReauthenticationCredential: Sendable {
    let identityToken: String
    let rawNonce: String
    let authorizationCode: String
}

enum AppleAuthorizationNonce {
    static func make() -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<32).map { _ in characters.randomElement(using: &generator)! })
    }
    static func hash(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// A single Apple response supplies the nonce-bound Firebase credential and revocation code.
@MainActor
final class AppleReauthenticator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<AppleReauthenticationCredential, Error>?
    private static var active: AppleReauthenticator?
    private let nonce = AppleAuthorizationNonce.make()
    private var controller: ASAuthorizationController?

    static func credential() async throws -> AppleReauthenticationCredential {
        try Task.checkCancellation()
        guard active == nil else { throw AuthFlowError.appleReauthenticationRequired }
        let reauthenticator = AppleReauthenticator()
        active = reauthenticator
        defer { active = nil }
        return try await reauthenticator.run()
    }

    private func run() async throws -> AppleReauthenticationCredential {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = []
            request.nonce = AppleAuthorizationNonce.hash(nonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.controller = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let code = credential?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let token = credential?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        Task { @MainActor in
            if let code, !code.isEmpty, let token, !token.isEmpty {
                self.continuation?.resume(returning: AppleReauthenticationCredential(identityToken: token, rawNonce: self.nonce, authorizationCode: code))
            }
            else { self.continuation?.resume(throwing: AuthFlowError.appleReauthenticationRequired) }
            self.continuation = nil
            self.controller = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        Task { @MainActor in
            self.continuation?.resume(throwing: cancelled ? AuthFlowError.reauthenticationCancelled : AuthFlowError.appleReauthenticationRequired)
            self.continuation = nil
            self.controller = nil
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}

actor UnavailableAuthRepository: AuthRepository {
    private var missing: Error { AppConfiguration.ConfigurationError.missingBackendConfiguration }
    func currentUser() async -> LociUser? { nil }
    func sessionChanges() async -> AsyncStream<LociUser?> { AsyncStream { $0.finish() } }
    func signIn(email: String, password: String) async throws -> LociUser { throw missing }
    func signUp(email: String, password: String, redirectTo: URL) async throws -> AuthSignUpResult { throw missing }
    func requestPasswordReset(email: String, redirectTo: URL) async throws { throw missing }
    func updatePassword(_ password: String) async throws -> LociUser { throw missing }
    func updateProfile(handle: String, avatar: AvatarChoice) async throws -> LociUser { throw missing }
    func resendVerificationEmail(email: String) async throws { throw missing }
    func sendMagicLink(email: String, redirectTo: URL) async throws { throw missing }
    func verifyEmailOTP(email: String, code: String) async throws -> LociUser { throw missing }
    func completeAuthCallback(_ url: URL) async throws -> LociUser? { throw missing }
    func signInWithApple(identityToken: String, nonce: String?, fullName: String?) async throws -> LociUser { throw missing }
    func signOut() async {}
    func accountDeletionMethod() async throws -> AccountDeletionMethod { throw missing }
    func deleteAccount(password: String?, expectedUserID: UUID) async throws { throw missing }
}
