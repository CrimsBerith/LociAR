import Foundation
@preconcurrency import FirebaseAppCheck
@preconcurrency import FirebaseCore

struct AppConfiguration: Sendable {
    enum ConfigurationError: LocalizedError {
        case missingBackendConfiguration

        var errorDescription: String? {
            "Bağlantı ayarları henüz tamamlanmadı. Uygulama yöneticisiyle iletişime geçin."
        }
    }

    /// Values from the Firebase console (Project settings → Your apps → iOS). They are client
    /// identifiers, not secrets; access is enforced by Security Rules and App Check.
    struct FirebaseSettings: Sendable, Equatable {
        let apiKey: String
        let googleAppID: String
        let gcmSenderID: String
        let projectID: String
        let storageBucket: String
        let functionsRegion: String
    }

    let firebase: FirebaseSettings?
    let appleAuthEnabled: Bool
    let privacyPolicyURL: URL?
    let termsURL: URL?
    let supportURL: URL?

    static func load(bundle: Bundle = .main) -> AppConfiguration {
        func value(_ key: String) -> String? {
            guard let raw = bundle.object(forInfoDictionaryKey: key) as? String else { return nil }
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return isPlaceholder(trimmed) ? nil : trimmed
        }
        let appleAuthEnabled = bundle.object(forInfoDictionaryKey: "LOCIAR_APPLE_AUTH_ENABLED") as? Bool ?? false
        var firebase: FirebaseSettings?
        if let apiKey = value("LOCIAR_FIREBASE_API_KEY"),
           let appID = value("LOCIAR_FIREBASE_GOOGLE_APP_ID"),
           let senderID = value("LOCIAR_FIREBASE_GCM_SENDER_ID"),
           let projectID = value("LOCIAR_FIREBASE_PROJECT_ID"),
           let bucket = value("LOCIAR_FIREBASE_STORAGE_BUCKET"),
           isSafeFirebaseClientKey(apiKey) {
            firebase = FirebaseSettings(
                apiKey: apiKey,
                googleAppID: appID,
                gcmSenderID: senderID,
                projectID: projectID,
                storageBucket: bucket,
                functionsRegion: value("LOCIAR_FIREBASE_FUNCTIONS_REGION") ?? "us-central1"
            )
        }
        return AppConfiguration(
            firebase: firebase,
            appleAuthEnabled: appleAuthEnabled,
            privacyPolicyURL: publicHTTPSURL(bundle.object(forInfoDictionaryKey: "LOCIAR_PRIVACY_URL") as? String),
            termsURL: publicHTTPSURL(bundle.object(forInfoDictionaryKey: "LOCIAR_TERMS_URL") as? String),
            supportURL: publicHTTPSURL(bundle.object(forInfoDictionaryKey: "LOCIAR_SUPPORT_URL") as? String)
        )
    }

    nonisolated static func isPlaceholder(_ value: String) -> Bool {
        value.isEmpty
            || value.contains("$(")
            || value.localizedCaseInsensitiveContains("YOUR-")
            || value.localizedCaseInsensitiveContains("placeholder")
    }

    static func publicHTTPSURL(_ rawValue: String?) -> URL? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isPlaceholder(trimmed),
              let url = URL(string: trimmed),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              !host.isEmpty else { return nil }
        let placeholderHosts: Set<String> = ["example.com", "example.org", "example.net", "localhost"]
        if placeholderHosts.contains(host)
            || host.hasSuffix(".example.com")
            || host.hasSuffix(".example.org")
            || host.hasSuffix(".example.net") {
            return nil
        }
        return url
    }

    /// Firebase iOS API keys start with "AIza". Anything that looks like a server credential
    /// (service-account JSON, private key) must never ship in the app bundle.
    static func isSafeFirebaseClientKey(_ rawValue: String?) -> Bool {
        guard let rawValue else { return false }
        let key = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercased = key.lowercased()
        guard key.hasPrefix("AIza"), key.count >= 30, key.count <= 60,
              !lowercased.contains("private_key"),
              !lowercased.contains("service_account"),
              !lowercased.contains("begin ") else { return false }
        return key.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }

    var isBackendConfigured: Bool { firebase != nil }

    /// Configures the default FirebaseApp once. Returns false when settings are missing, in which
    /// case the app stays fail-closed at the auth gate (same behaviour as before the migration).
    @MainActor
    @discardableResult
    func configureFirebaseIfNeeded() -> Bool {
        if FirebaseApp.app() != nil { return true }
        guard let firebase else { return false }
#if DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
#else
        AppCheck.setAppCheckProviderFactory(LociAppCheckProviderFactory())
#endif
        let options = FirebaseOptions(googleAppID: firebase.googleAppID, gcmSenderID: firebase.gcmSenderID)
        options.apiKey = firebase.apiKey
        options.projectID = firebase.projectID
        options.storageBucket = firebase.storageBucket
        options.bundleID = Bundle.main.bundleIdentifier ?? "com.khankartal.lociar"
        FirebaseApp.configure(options: options)
        return true
    }
}

/// App Attest in release builds. Enforcement is switched on in the Firebase console once
/// TestFlight builds are verified.
final class LociAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        AppAttestProvider(app: app)
    }
}
