import Foundation
@preconcurrency import FirebaseStorage
import CryptoKit

enum MediaAssetStore {
    static let signedURLLifetimeSeconds = 60 * 60

#if DEBUG
    /// Test-only: device photo/video posts were removed, nothing in the app stages media anymore.
    nonisolated static func stage(data: Data, id: UUID, isVideo: Bool) async throws -> URL {
        try await Task.detached(priority: .utility) {
            let root = try preparedStagingDirectory()
            let url = root.appendingPathComponent("\(id.uuidString).\(isVideo ? "mov" : "jpg")")
            try data.write(to: url, options: .atomic)
            return url
        }.value
    }
#endif

    private nonisolated static func applicationSupportDirectory(fileManager: FileManager = .default) -> URL {
        fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
    }

    nonisolated static func removeLocalAssets(in post: LociPost) async {
        try? await removeLocalAssetsChecked(in: post)
    }

    nonisolated static func removeLocalAssetsChecked(in post: LociPost) async throws {
        try await Task.detached(priority: .utility) {
            var urls = post.editData.layers.compactMap(\.assetURL)
            if let surfaceTextureURL = post.editData.surfaceTextureURL { urls.append(surfaceTextureURL) }
            if let persistence = post.anchorBundle.anchor.persistence {
                if let raw = persistence.assetURI, let url = URL(string: raw) { urls.append(url) }
                if let raw = persistence.referenceImageURI, let url = URL(string: raw) { urls.append(url) }
            }
            switch post.contentSource {
            case .image(let url)?, .video(let url)?: urls.append(url)
            default: break
            }
            for url in Set(urls) where isOwnedLocalAsset(url) {
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
            }
        }.value
    }

    nonisolated static func purgeAllLocalAssets() async {
        await Task.detached(priority: .utility) {
            let fileManager = FileManager.default
            let support = applicationSupportDirectory(fileManager: fileManager)
            for directoryName in ["LociARStagedMedia", "LociARWorldMaps"] {
                try? fileManager.removeItem(at: support.appendingPathComponent(directoryName, isDirectory: true))
            }
            if let temporaryItems = try? fileManager.contentsOfDirectory(
                at: fileManager.temporaryDirectory,
                includingPropertiesForKeys: nil
            ) {
                for url in temporaryItems where url.lastPathComponent.hasPrefix("lociar-picked-") {
                    try? fileManager.removeItem(at: url)
                }
            }
        }.value
    }

    private nonisolated static func preparedStagingDirectory() throws -> URL {
        let fileManager = FileManager.default
        var root = applicationSupportDirectory(fileManager: fileManager)
            .appendingPathComponent("LociARStagedMedia", isDirectory: true)
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: root.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try root.setResourceValues(values)
        return root
    }

    /// Pinning writes `<anchor>.lociarmap` (+ `.jpg`) under LociARWorldMaps before a draft exists;
    /// a re-pin or an abandoned create screen leaves them behind (up to 20 MB each). Removes files
    /// no saved draft or queued publish names, once they are older than `age`.
    nonisolated static func sweepUnreferencedWorldMaps(referenced: Set<String>, olderThan age: TimeInterval = 86_400,
                                                       now: Date = Date()) async {
        await Task.detached(priority: .utility) {
            let fileManager = FileManager.default
            let directory = applicationSupportDirectory(fileManager: fileManager)
                .appendingPathComponent("LociARWorldMaps", isDirectory: true)
            guard let files = try? fileManager.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey]
            ) else { return }
            let kept = Set(referenced.map { $0.lowercased() })
            let cutoff = now.addingTimeInterval(-age)
            for url in files where !kept.contains(url.lastPathComponent.lowercased()) {
                let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .isRegularFileKey])
                guard values?.isRegularFile == true,
                      (values?.contentModificationDate ?? .distantFuture) < cutoff else { continue }
                try? fileManager.removeItem(at: url)
            }
        }.value
    }

    private nonisolated static func isOwnedLocalAsset(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        let fileManager = FileManager.default
        let support = applicationSupportDirectory(fileManager: fileManager)
        return isDescendant(url, of: support.appendingPathComponent("LociARStagedMedia", isDirectory: true))
            || isDescendant(url, of: support.appendingPathComponent("LociARWorldMaps", isDirectory: true))
            || (isDescendant(url, of: fileManager.temporaryDirectory)
                && url.lastPathComponent.hasPrefix("lociar-picked-"))
    }

    private nonisolated static func isDescendant(_ url: URL, of directory: URL) -> Bool {
        let path = url.standardizedFileURL.path
        let directoryPath = directory.standardizedFileURL.path
        return path == directoryPath || path.hasPrefix(directoryPath + "/")
    }


    /// Firebase Storage has one bucket; the Supabase bucket names live on as top-level folders.
    nonisolated static func storageReference(_ reference: StorageAssetReference) -> StorageReference {
        Storage.storage().reference(withPath: "\(reference.bucket)/\(reference.path)")
    }

    nonisolated static func upload(_ data: Data, bucket: String, path: String, contentType: String) async throws -> URL {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        let checksum = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        metadata.customMetadata = ["sha256": checksum]
        let ref = Storage.storage().reference(withPath: "\(bucket)/\(path)")
        // Paths are deterministic per post, so a retry after a transient createPost failure finds
        // the object already there and skips re-uploading (world maps can be up to 50 MB).
        if let existing = try? await ref.getMetadata(), existing.size == Int64(data.count), existing.customMetadata?["sha256"] == checksum {
            return storageURL(bucket: bucket, path: path)
        }
        _ = try await ref.putDataAsync(data, metadata: metadata)
        return storageURL(bucket: bucket, path: path)
    }

    /// Resolves a `storage://` locator to a downloadable HTTPS URL (tokenised download URL).
    nonisolated static func downloadURL(for url: URL) async -> URL? {
        guard let reference = StorageAssetReference(url: url) else { return nil }
        return try? await storageReference(reference).downloadURL()
    }

    static func uploadLocalAssets(in post: LociPost) async throws -> LociPost {
        // Posts are text and social media links only. Device media uploads were removed on 29 Sep 2026.
        // World maps are uploaded by WorldMapStore.
        post
    }

    static func materializeRemoteAssets(in source: LociPost) async -> LociPost {
        var post = source
        if let url = post.editData.surfaceTextureURL, let resolved = await downloadURL(for: url) {
            post.editData.surfaceTextureURL = resolved
        }
        return post
    }

    /// Best-effort removal of the world map a rejected publish uploaded. Storage rules deny listing,
    /// so a prefix walk deleted nothing; the owner may delete its still-draft map by exact path.
    /// Anything left behind is reclaimed by the server's orphan-upload sweep.
    nonisolated static func removeUploadedWorldMap(of post: LociPost) async {
        guard let raw = post.anchorBundle.anchor.persistence?.storagePath,
              let url = URL(string: raw), let reference = StorageAssetReference(url: url),
              reference.bucket == "post-world-maps" else { return }
        try? await storageReference(reference).delete()
    }

    nonisolated static func storageURL(bucket: String, path: String) -> URL {
        let cleanPath = path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path
        return URL(string: "storage://\(bucket)/\(cleanPath)") ?? URL(string: "storage://\(bucket)/") ?? URL(fileURLWithPath: "/")
    }
}

struct StorageAssetReference: Equatable, Sendable {
    let bucket: String
    let path: String

    init?(url: URL) {
        guard url.scheme == "storage", let host = url.host, !host.isEmpty else { return nil }
        let objectPath = url.path.drop(while: { $0 == "/" })
        guard !objectPath.isEmpty else { return nil }
        bucket = host
        path = String(objectPath).removingPercentEncoding ?? String(objectPath)
    }
}
