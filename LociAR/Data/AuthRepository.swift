import AuthenticationServices
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
    func deleteAccount() async throws
}

struct AuthSignUpResult: Sendable {
    let user: LociUser
    let requiresEmailConfirmation: Bool
}

enum AuthFlowError: LocalizedError, Sendable {
    case emailNotVerified
    case notSignedIn
    case unsupported
    case invalidHandle
    case handleTaken
    case invalidPhoto
    case appleReauthenticationRequired

    var errorDescription: String? {
        switch self {
        case .emailNotVerified:
            "E-posta adresin henüz doğrulanmadı. Gelen kutundaki bağlantıya dokunduktan sonra tekrar giriş yap."
        case .notSignedIn:
            "Oturum bulunamadı. Lütfen tekrar giriş yap."
        case .unsupported:
            "Bu giriş yöntemi artık desteklenmiyor. E-posta ve şifre ya da Apple ile giriş yap."
        case .invalidHandle:
            "Kullanıcı adı 3–30 karakter olmalı; yalnızca küçük harf, rakam, alt çizgi ve nokta içerebilir."
        case .handleTaken:
            "Bu kullanıcı adı başka biri tarafından kullanılıyor. Farklı bir ad dene."
        case .invalidPhoto:
            "Fotoğraf hazırlanamadı. Farklı bir fotoğraf dene."
        case .appleReauthenticationRequired:
            "Hesabı silmek için Apple ile yeniden doğrulama gerekiyor."
        }
    }
}

/// Firebase Authentication. A Firebase session whose email is not verified yet is kept
/// (so verification mail can be re-sent) but is never surfaced to the app as signed in.
final class FirebaseAuthRepository: AuthRepository, @unchecked Sendable {
    private let callables: CallableClient

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
        let response: EnsureProfileResponse = try await callables.call(
            "ensureProfile",
            payload: EnsureProfilePayload(displayName: displayName)
        )
        if response.claimsUpdated {
            _ = try await user.getIDTokenResult(forcingRefresh: true)
        }
        let avatar = await AvatarReference.resolve(avatarURL: response.avatarURL, preset: response.avatarPreset)
        if user.displayName != response.handle {
            let change = user.createProfileChangeRequest()
            change.displayName = response.handle
            try? await change.commitChanges()
        }
        return Self.domainUser(user, handle: response.handle, avatarURL: avatar)
    }

    func currentUser() async -> LociUser? {
        guard let user = Auth.auth().currentUser else { return nil }
        try? await user.reload()
        guard let refreshed = Auth.auth().currentUser, Self.isVerified(refreshed) else { return nil }
        if let established = try? await establish(refreshed) { return established }
        // Offline launch: fall back to cached Auth profile; claims are refreshed on next launch.
        return Self.domainUser(refreshed)
    }

    func sessionChanges() async -> AsyncStream<LociUser?> {
        AsyncStream { continuation in
            let box = ListenerBox()
            box.handle = Auth.auth().addStateDidChangeListener { _, user in
                guard let user else {
                    continuation.yield(nil)
                    return
                }
                continuation.yield(Self.isVerified(user) ? Self.domainUser(user) : nil)
            }
            continuation.onTermination = { _ in
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
            struct Payload: Encodable, Sendable { let handle: String }
            struct Response: Decodable, Sendable { let handle: String }
            do {
                let _: Response = try await callables.call("updateHandle", payload: Payload(handle: clean))
            } catch BackendCallError.rejected(let code, _, let reason) where reason == "handle_taken" || code == FunctionsErrorCode.alreadyExists.rawValue {
                throw AuthFlowError.handleTaken
            }
        }

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
            let metadata = StorageMetadata()
            metadata.contentType = "image/jpeg"
            let path = "avatars/\(luid)/pending/\(UUID().uuidString.lowercased()).jpg"
            _ = try await Storage.storage().reference(withPath: path).putDataAsync(jpeg, metadata: metadata)
        }
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
        try? Auth.auth().signOut()
    }

    func deleteAccount() async throws {
        guard let user = Auth.auth().currentUser else { throw AuthFlowError.notSignedIn }

        if user.providerData.contains(where: { $0.providerID == "apple.com" }) {
            // Guideline 5.1.1(v): the Sign in with Apple token must be revoked before deletion.
            // Failure aborts deletion so no dangling Apple grant is left behind.
            do {
                let code = try await AppleReauthenticator.authorizationCode()
                try await Auth.auth().revokeToken(withAuthorizationCode: code)
            } catch {
                throw AuthFlowError.appleReauthenticationRequired
            }
        }

        // The callable hard-deletes profile, posts, social edges, Storage files and the Auth user.
        struct DeleteResponse: Decodable, Sendable { let ok: Bool }
        let response: DeleteResponse = try await callables.call("deleteAccount")
        guard response.ok else { throw BackendCallError.invalidResponse }
        try? Auth.auth().signOut()
    }
}

private final class ListenerBox: @unchecked Sendable {
    var handle: AuthStateDidChangeListenerHandle?
}

/// Presents a Sign in with Apple sheet solely to obtain a fresh authorization code for token
/// revocation during account deletion.
@MainActor
final class AppleReauthenticator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<String, Error>?
    private static var active: AppleReauthenticator?

    static func authorizationCode() async throws -> String {
        let reauthenticator = AppleReauthenticator()
        active = reauthenticator
        defer { active = nil }
        return try await reauthenticator.run()
    }

    private func run() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = []
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let code = (authorization.credential as? ASAuthorizationAppleIDCredential)?.authorizationCode
            .flatMap { String(data: $0, encoding: .utf8) }
        Task { @MainActor in
            if let code { self.continuation?.resume(returning: code) }
            else { self.continuation?.resume(throwing: AuthFlowError.appleReauthenticationRequired) }
            self.continuation = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        Task { @MainActor in
            self.continuation?.resume(throwing: AuthFlowError.appleReauthenticationRequired)
            self.continuation = nil
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
    func deleteAccount() async throws { throw missing }
}
