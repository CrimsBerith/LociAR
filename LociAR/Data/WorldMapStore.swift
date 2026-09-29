import Foundation
@preconcurrency import FirebaseStorage

protocol WorldMapRepository: Sendable {
    func uploadLocalPersistenceIfNeeded(in post: LociPost) async throws -> LociPost
    func upload(_ package: SavedWorldMapPackage, userID: UUID, draftID: UUID) async throws -> WorldLockPersistence
    func download(_ persistence: WorldLockPersistence) async throws -> Data
    func downloadReference(_ persistence: WorldLockPersistence) async throws -> Data?
}

actor LocalWorldMapStore: WorldMapRepository {
    enum LocalStoreError: LocalizedError {
        case invalidLocalURL
        case invalidSize

        var errorDescription: String? {
            switch self {
            case .invalidLocalURL: "Yerel yüzey kaydı güvenli uygulama klasöründe bulunamadı."
            case .invalidSize: "Yerel yüzey kaydı boş veya 50 MB sınırını aşıyor."
            }
        }
    }

    private let allowedDirectory: URL

    init(allowedDirectory: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        self.allowedDirectory = (allowedDirectory ?? support.appendingPathComponent("LociARWorldMaps", isDirectory: true))
            .standardizedFileURL
    }

    func uploadLocalPersistenceIfNeeded(in post: LociPost) async throws -> LociPost { post }

    func upload(_ package: SavedWorldMapPackage, userID: UUID, draftID: UUID) async throws -> WorldLockPersistence {
        package.persistence
    }

    func download(_ persistence: WorldLockPersistence) async throws -> Data {
        guard let raw = persistence.assetURI,
              let url = URL(string: raw) else { throw LocalStoreError.invalidLocalURL }
        return try await read(
            url,
            expectedFilename: "\(persistence.originalNativeAnchorId.uuidString).lociarmap",
            minimumSize: 64
        )
    }

    func downloadReference(_ persistence: WorldLockPersistence) async throws -> Data? {
        guard let raw = persistence.referenceImageURI else { return nil }
        guard let url = URL(string: raw) else { throw LocalStoreError.invalidLocalURL }
        return try await read(
            url,
            expectedFilename: "\(persistence.originalNativeAnchorId.uuidString).jpg",
            minimumSize: 1
        )
    }

    private func read(_ url: URL, expectedFilename: String, minimumSize: Int) async throws -> Data {
        guard url.isFileURL, url.lastPathComponent == expectedFilename else {
            throw LocalStoreError.invalidLocalURL
        }
        let stored = url.standardizedFileURL
        let rootPath = allowedDirectory.path.hasSuffix("/") ? allowedDirectory.path : allowedDirectory.path + "/"
        let resolved: URL
        if stored.path.hasPrefix(rootPath) {
            resolved = stored
        } else {
            // iOS can rotate an app data-container UUID across installs while preserving its
            // contents. Rebind only the exact anchor-owned filename from LociARWorldMaps.
            guard stored.deletingLastPathComponent().lastPathComponent == "LociARWorldMaps" else {
                throw LocalStoreError.invalidLocalURL
            }
            resolved = allowedDirectory.appendingPathComponent(expectedFilename).standardizedFileURL
        }
        var isDirectory: ObjCBool = false
        guard resolved.path.hasPrefix(rootPath),
              FileManager.default.fileExists(atPath: resolved.path, isDirectory: &isDirectory),
              !isDirectory.boolValue else {
            throw LocalStoreError.invalidLocalURL
        }
        let data = try await Task.detached(priority: .userInitiated) {
            try Data(contentsOf: resolved, options: [.mappedIfSafe])
        }.value
        guard data.count >= minimumSize, data.count <= 50 * 1_024 * 1_024 else {
            throw LocalStoreError.invalidSize
        }
        return data
    }
}

/// Remote world maps in Firebase Storage (`post-world-maps/<luid>/<post>/<anchor>.lociarmap`).
final class WorldMapStore: WorldMapRepository, @unchecked Sendable {
    static let mapBucket = "post-world-maps"
    static let referenceBucket = "post-reference-images"

    enum StoreError: LocalizedError {
        case invalidSize
        case missingStoragePath

        var errorDescription: String? {
            switch self {
            case .invalidSize: "World map boş veya 50 MB sınırını aşıyor."
            case .missingStoragePath: "Kalıcı world-map storage yolu bulunamadı."
            }
        }
    }

    init() {}

    func uploadLocalPersistenceIfNeeded(in post: LociPost) async throws -> LociPost {
        guard let persistence = post.anchorBundle.anchor.persistence,
              persistence.storagePath == nil,
              let mapURL = persistence.assetURI.flatMap(URL.init(string:)),
              mapURL.isFileURL else { return post }

        let urls = SendableLocalURLs(map: mapURL, reference: nil)
        let local = try await Task.detached(priority: .utility) {
            let mapData = try Data(contentsOf: urls.map, options: [.mappedIfSafe])
            let referenceData = try urls.reference.map { try Data(contentsOf: $0, options: [.mappedIfSafe]) }
            return SendableLocalPackage(map: mapData, reference: referenceData)
        }.value
        let package = SavedWorldMapPackage(mapData: local.map, referenceImageData: local.reference, persistence: persistence)
        let uploaded = try await upload(package, userID: post.creatorID, draftID: post.id)
        var updated = post
        updated.anchorBundle.anchor.persistence = uploaded
        return updated
    }

    func upload(_ package: SavedWorldMapPackage, userID: UUID, draftID: UUID) async throws -> WorldLockPersistence {
        guard package.mapData.count >= 64, package.mapData.count <= 50 * 1_024 * 1_024 else { throw StoreError.invalidSize }
        let basePath = "\(StorageObjectPath.ownerFolder(userID))/\(draftID.uuidString.lowercased())"
        let mapPath = "\(basePath)/\(StorageObjectPath.anchorFileName(package.persistence.originalNativeAnchorId, fileExtension: "lociarmap"))"
        _ = try await MediaAssetStore.upload(package.mapData, bucket: Self.mapBucket, path: mapPath, contentType: "application/x-lociarmap")
        // Reference camera frames are no longer uploaded (Storage denies them); drafts queued by
        // older builds may still carry one locally, and it is simply ignored.

        var persistence = package.persistence
        persistence.storagePath = "storage://\(Self.mapBucket)/\(mapPath)"
        persistence.assetURI = persistence.storagePath
        persistence.assetURL = nil
        persistence.referenceImageURI = nil
        return persistence
    }

    func materialize(_ persistence: WorldLockPersistence) async throws -> URL {
        if let local = persistence.assetURI.flatMap(URL.init(string:)), local.isFileURL { return local }
        if let path = persistence.storagePath ?? persistence.assetURI,
           path.hasPrefix("storage://\(Self.mapBucket)/"),
           let locator = URL(string: path),
           let reference = StorageAssetReference(url: locator) {
            return try await MediaAssetStore.storageReference(reference).downloadURL()
        }
        if let remote = persistence.assetURL.flatMap(URL.init(string:)) { return remote }
        throw StoreError.missingStoragePath
    }

    func download(_ persistence: WorldLockPersistence) async throws -> Data {
        let url = try await materialize(persistence)
        if url.isFileURL {
            return try await Task.detached(priority: .userInitiated) {
                try Data(contentsOf: url, options: [.mappedIfSafe])
            }.value
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), data.count >= 64 else {
            throw URLError(.cannotDecodeContentData)
        }
        return data
    }

    func downloadReference(_ persistence: WorldLockPersistence) async throws -> Data? {
        guard let raw = persistence.referenceImageURI else { return nil }
        let url: URL
        if raw.hasPrefix("storage://\(Self.referenceBucket)/"),
           let locator = URL(string: raw),
           let reference = StorageAssetReference(url: locator) {
            url = try await MediaAssetStore.storageReference(reference).downloadURL()
        } else if let remote = URL(string: raw), remote.isFileURL {
            return try await Task.detached(priority: .utility) {
                try Data(contentsOf: remote, options: [.mappedIfSafe])
            }.value
        } else if let remote = URL(string: raw), ["https", "http"].contains(remote.scheme) {
            url = remote
        } else {
            return nil
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), !data.isEmpty else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}

private struct SendableLocalURLs: @unchecked Sendable { let map: URL; let reference: URL? }
private struct SendableLocalPackage: Sendable { let map: Data; let reference: Data? }

enum StorageObjectPath {
    /// Top-level folders in the Firebase Storage bucket (formerly separate Supabase buckets).
    nonisolated static let folders = [
        "post-world-maps", "post-reference-images", "post-layer-assets", "post-video-assets", "post-surface-textures",
    ]

    nonisolated static func ownerFolder(_ userID: UUID) -> String {
        userID.uuidString.lowercased()
    }

    nonisolated static func anchorFileName(_ anchorID: UUID, fileExtension: String) -> String {
        "\(anchorID.uuidString.lowercased()).\(fileExtension)"
    }
}
