import Foundation
import OSLog
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
            case .invalidLocalURL: String(localized: "Yerel yüzey kaydı güvenli uygulama klasöründe bulunamadı.")
            case .invalidSize: String(localized: "Yerel yüzey kaydı boş veya 50 MB sınırını aşıyor.")
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
    private static let logger = Logger(subsystem: "com.khankartal.lociar", category: "worldmap")
    static let referenceBucket = "post-reference-images"

    enum StoreError: LocalizedError {
        case invalidSize
        case missingStoragePath

        var errorDescription: String? {
            switch self {
            case .invalidSize: String(localized: "World map boş veya 50 MB sınırını aşıyor.")
            case .missingStoragePath: String(localized: "Kalıcı world-map storage yolu bulunamadı.")
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
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable { let userId: String; let postId: String }
        struct Response: Decodable { let admitted: Bool }
        let response: Response = try await CallableClient(region: AppConfiguration.load().firebase?.functionsRegion ?? "us-central1").call("beginWorldMapUpload", payload: Payload(userId: FirebaseIdentity.key(userID), postId: FirebaseIdentity.key(draftID)))
        guard response.admitted else { throw StoreError.missingStoragePath }
        guard package.mapData.count >= 64 else { throw StoreError.invalidSize }
        let raw = package.mapData
        let encoded = try await Task.detached(priority: .utility) { try WorldMapCodec.encode(raw) }.value
        Self.logger.info("World map size raw=\(raw.count) compressed=\(encoded.count)")
        guard encoded.count <= WorldMapCodec.maximumUploadBytes else {
            throw WorldMapCodec.CodecError.tooLarge(bytes: encoded.count)
        }
        let basePath = "\(StorageObjectPath.ownerFolder(userID))/\(draftID.uuidString.lowercased())"
        let mapPath = "\(basePath)/\(StorageObjectPath.anchorFileName(package.persistence.originalNativeAnchorId, fileExtension: "lociarmap"))"
        _ = try await MediaAssetStore.upload(encoded, bucket: Self.mapBucket, path: mapPath, contentType: "application/x-lociarmap")
        // Reference camera frames are no longer uploaded (Storage denies them); drafts queued by
        // older builds may still carry one locally, and it is simply ignored.

        var persistence = package.persistence
        persistence.storagePath = "storage://\(Self.mapBucket)/\(mapPath)"
        persistence.assetURI = persistence.storagePath
        persistence.assetURL = nil
        persistence.referenceImageURI = nil
        return persistence
    }

    /// Storage SDK downloads re-evaluate current access. Permanent bearer URLs and HTTP
    /// fallbacks are forbidden for maps, including old locator fields.
    func download(_ persistence: WorldLockPersistence) async throws -> Data {
        if let local = persistence.assetURI.flatMap(URL.init(string:)), local.isFileURL {
            let data = try await LocalWorldMapStore().download(persistence)
            return try WorldMapCodec.decode(data)
        }
        guard let path = persistence.storagePath ?? persistence.assetURI,
              path.hasPrefix("storage://\(Self.mapBucket)/"), let locator = URL(string: path),
              let reference = StorageAssetReference(url: locator) else { throw StoreError.missingStoragePath }
        let ref = MediaAssetStore.storageReference(reference)
        // Even a cache hit needs current authorization; removed/private posts cannot reopen
        // geometry downloaded in an earlier session. Cache directories are scoped per account.
        let metadata = try await ref.getMetadata()
        guard metadata.size > 0, metadata.size <= Int64(WorldMapCodec.maximumUploadBytes) else { throw StoreError.invalidSize }
        let cache = WorldMapDownloadCache.standard
        if let cached = cache?.read(path) { return try WorldMapCodec.decode(cached) }
        let data = try await ref.data(maxSize: Int64(WorldMapCodec.maximumUploadBytes))
        let raw = try WorldMapCodec.decode(data)
        cache?.write(data, for: path)
        return raw
    }

    func downloadReference(_ persistence: WorldLockPersistence) async throws -> Data? {
        // Camera reference frames were retired; no remote token or URL is accepted.
        guard let raw = persistence.referenceImageURI, let local = URL(string: raw), local.isFileURL else { return nil }
        return try await LocalWorldMapStore().downloadReference(persistence)
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
