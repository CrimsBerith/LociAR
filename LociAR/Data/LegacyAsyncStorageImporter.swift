import CryptoKit
import Foundation

struct LegacyImportResult: Equatable, Sendable {
    var values: [String: Data]
    var skippedKeys: [String]
}

struct LegacyAsyncStorageImporter {
    static let migrationMarker = "lociar.native.legacy-import.v1.completed"
    static let supportedKeys: Set<String> = [
        "lociar_posts_v4_mockup",
        "lociar_events_v1",
        "lociar_pending_sync",
        "lociar_dead_letter_sync_v1",
        "lociar_liked_posts_v1",
        "lociar_saved_posts_v1",
        "lociar_follows_v1",
        "lociar_blocks_v1",
        "lociar_collections_v1",
        "lociar_onboarding_v1",
        "lociar_theme_mode_v1"
    ]

    let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func importIfNeeded(applicationSupportURL: URL, documentsURL: URL? = nil, bundleIdentifier: String? = Bundle.main.bundleIdentifier) throws -> LegacyImportResult {
        guard !userDefaults.bool(forKey: Self.migrationMarker) else {
            return LegacyImportResult(values: [:], skippedKeys: [])
        }

        var directories = [
            applicationSupportURL.appendingPathComponent("RCTAsyncLocalStorage_V1", isDirectory: true),
            applicationSupportURL.appendingPathComponent("com.reactnativecommunity.asyncstorage", isDirectory: true)
        ]
        if let bundleIdentifier {
            let bundleRoot = applicationSupportURL.appendingPathComponent(bundleIdentifier, isDirectory: true)
            directories.insert(bundleRoot.appendingPathComponent("RCTAsyncLocalStorage_V1", isDirectory: true), at: 0)
        }
        if let documentsURL {
            directories.append(documentsURL.appendingPathComponent("RCTAsyncLocalStorage_V1", isDirectory: true))
            directories.append(documentsURL.appendingPathComponent("RNCAsyncLocalStorage_V1", isDirectory: true))
            directories.append(documentsURL.appendingPathComponent("RCTAsyncLocalStorage", isDirectory: true))
        }
        var imported: [String: Data] = [:]
        var skipped: [String] = []

        for directory in directories {
            let manifestURL = directory.appendingPathComponent("manifest.json")
            guard let data = try? Data(contentsOf: manifestURL),
                  let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

            for (key, rawValue) in manifest {
                guard Self.isSupported(key) else {
                    skipped.append(key)
                    continue
                }
                if let inline = rawValue as? String {
                    imported[key] = Data(inline.utf8)
                } else if rawValue is NSNull {
                    let fileName = Self.storageFileName(for: key)
                    let valueURL = directory.appendingPathComponent(fileName)
                    if let value = try? Data(contentsOf: valueURL) { imported[key] = value }
                }
            }
        }

        // Corrupt or unexpectedly broad legacy manifests must never crash launch.
        // Auth/session material is removed fail-closed before returning anything.
        let authKeys = imported.keys.filter(Self.isAuthMaterial)
        for key in authKeys { imported.removeValue(forKey: key) }
        skipped.append(contentsOf: authKeys)
        return LegacyImportResult(values: imported, skippedKeys: skipped.sorted())
    }

    func markCompleted() { userDefaults.set(true, forKey: Self.migrationMarker) }

    private static func isSupported(_ key: String) -> Bool {
        supportedKeys.contains(key) || supportedKeys.contains { key.hasPrefix($0 + ":user:") }
    }

    private static func isAuthMaterial(_ key: String) -> Bool {
        let normalized = key.lowercased()
        return normalized.contains("auth-token")
            || normalized.contains("access_token")
            || normalized.contains("refresh_token")
            || normalized.contains("session")
    }

    static func storageFileName(for key: String) -> String {
        Insecure.MD5.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
