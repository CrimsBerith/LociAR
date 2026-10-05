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
            let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
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
        var root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
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

    private nonisolated static func isOwnedLocalAsset(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        let fileManager = FileManager.default
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
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

    /// Best-effort removal of every object a draft/post uploaded (used when the server rejects a publish).
    nonisolated static func removeRemoteAssets(ownerID: UUID, postID: UUID) async {
        let prefix = "\(StorageObjectPath.ownerFolder(ownerID))/\(postID.uuidString.lowercased())"
        for bucket in StorageObjectPath.folders {
            await deleteRecursively(Storage.storage().reference(withPath: "\(bucket)/\(prefix)"))
        }
    }

    private nonisolated static func deleteRecursively(_ folder: StorageReference) async {
        guard let listing = try? await folder.listAll() else { return }
        for item in listing.items { try? await item.delete() }
        for child in listing.prefixes { await deleteRecursively(child) }
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
