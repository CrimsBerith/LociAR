import Foundation
import ImageIO
@preconcurrency import FirebaseStorage
import UniformTypeIdentifiers

enum MediaAssetStore {
    static let signedURLLifetimeSeconds = 60 * 60

    enum AssetError: LocalizedError {
        case tooLarge
        case unreadableImage

        var errorDescription: String? {
            switch self {
            case .tooLarge: "Seçilen video 80 MB sınırını aşıyor. Daha kısa bir video seçin."
            case .unreadableImage: "Fotoğraf işlenemedi. Farklı bir fotoğraf seçin."
            }
        }
    }

    nonisolated static func stage(data: Data, id: UUID, isVideo: Bool) async throws -> URL {
        try await Task.detached(priority: .utility) {
            let root = try preparedStagingDirectory()
            let url = root.appendingPathComponent("\(id.uuidString).\(isVideo ? "mov" : "jpg")")
            if isVideo {
                guard data.count <= 80 * 1_024 * 1_024 else { throw AssetError.tooLarge }
                try data.write(to: url, options: .atomic)
            } else {
                let jpeg = try makeUploadJPEG(from: data)
                try jpeg.write(to: url, options: .atomic)
            }
            return url
        }.value
    }

    nonisolated static func stage(fileURL: URL, id: UUID) async throws -> URL {
        try await Task.detached(priority: .utility) {
            let values = try fileURL.resourceValues(forKeys: [.fileSizeKey])
            guard let fileSize = values.fileSize, fileSize <= 80 * 1_024 * 1_024 else { throw AssetError.tooLarge }
            let root = try preparedStagingDirectory()
            let sourceExtension = fileURL.pathExtension.lowercased()
            let fileExtension = ["mov", "mp4"].contains(sourceExtension) ? sourceExtension : "mov"
            let destination = root.appendingPathComponent("\(id.uuidString).\(fileExtension)")
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: fileURL, to: destination)
            if isDescendant(fileURL, of: FileManager.default.temporaryDirectory) {
                try? FileManager.default.removeItem(at: fileURL)
            }
            return destination
        }.value
    }

    nonisolated static func removeLocalAssets(in post: LociPost) async {
        await Task.detached(priority: .utility) {
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
                try? FileManager.default.removeItem(at: url)
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

    private nonisolated static func makeUploadJPEG(from data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            throw AssetError.unreadableImage
        }

        for (maxPixel, quality) in [(2400, 0.82), (1900, 0.74), (1500, 0.68)] {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixel
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { continue }
            let output = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { continue }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { continue }
            let jpeg = output as Data
            if jpeg.count <= 5 * 1_024 * 1_024 { return jpeg }
        }
        throw AssetError.tooLarge
    }

    /// Firebase Storage has one bucket; the Supabase bucket names live on as top-level folders.
    nonisolated static func storageReference(_ reference: StorageAssetReference) -> StorageReference {
        Storage.storage().reference(withPath: "\(reference.bucket)/\(reference.path)")
    }

    nonisolated static func upload(_ data: Data, bucket: String, path: String, contentType: String) async throws -> URL {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        let ref = Storage.storage().reference(withPath: "\(bucket)/\(path)")
        _ = try await ref.putDataAsync(data, metadata: metadata)
        return storageURL(bucket: bucket, path: path)
    }

    /// Resolves a `storage://` locator to a downloadable HTTPS URL (tokenised download URL).
    nonisolated static func downloadURL(for url: URL) async -> URL? {
        guard let reference = StorageAssetReference(url: url) else { return nil }
        return try? await storageReference(reference).downloadURL()
    }

    static func uploadLocalAssets(in post: LociPost) async throws -> LociPost {
        var post = post
        var layers = post.editData.layers
        let owner = StorageObjectPath.ownerFolder(post.creatorID)
        let postFolder = post.id.uuidString.lowercased()
        for index in layers.indices {
            guard layers[index].kind == .image, let url = layers[index].assetURL, url.isFileURL else { continue }
            let data = try Data(contentsOf: url)
            guard data.count <= 5 * 1_024 * 1_024 else { throw AssetError.tooLarge }
            let path = "\(owner)/\(postFolder)/layers/\(layers[index].id.uuidString.lowercased()).jpg"
            layers[index].assetURL = try await upload(data, bucket: "post-layer-assets", path: path, contentType: "image/jpeg")
        }
        post.editData.layers = layers

        if case .video(let url)? = post.contentSource, url.isFileURL {
            let data = try Data(contentsOf: url)
            guard data.count <= 80 * 1_024 * 1_024 else { throw AssetError.tooLarge }
            let isMP4 = url.pathExtension.lowercased() == "mp4"
            let path = "\(owner)/\(postFolder)/video.\(isMP4 ? "mp4" : "mov")"
            let remote = try await upload(data, bucket: "post-video-assets", path: path, contentType: isMP4 ? "video/mp4" : "video/quicktime")
            post.contentSource = .video(remote)
        }
        return post
    }

    static func materializeRemoteAssets(in source: LociPost) async -> LociPost {
        var post = source
        for index in post.editData.layers.indices {
            guard let url = post.editData.layers[index].assetURL,
                  let resolved = await downloadURL(for: url) else { continue }
            post.editData.layers[index].assetURL = resolved
        }
        if let url = post.editData.surfaceTextureURL, let resolved = await downloadURL(for: url) {
            post.editData.surfaceTextureURL = resolved
        }
        if case .video(let url)? = post.contentSource, let resolved = await downloadURL(for: url) {
            post.contentSource = .video(resolved)
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
