import Foundation
@preconcurrency import FirebaseStorage
import UIKit
import ImageIO

/// What the user picked in the profile editor.
enum AvatarChoice: Sendable, Equatable {
    case unchanged
    case preset(String)
    case photo(Data)
}

/// Profile photos live in Firebase Storage at `storage://avatars/<luid>/current/<id>.jpg` and are
/// written only by the server after SafeSearch screening. Preset avatars are encoded as
/// `avatar-preset:<name>` URLs so every screen keeps passing a single `URL?` to `LociAvatar`.
enum AvatarReference {
    nonisolated static func thumbnail(from data: Data, maxPixelSize: Int) async -> UIImage? {
        await Task.detached(priority: .utility) {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixelSize),
                    kCGImageSourceShouldCacheImmediately: true,
                  ] as CFDictionary) else { return nil }
            return UIImage(cgImage: image)
        }.value
    }
    /// Must match `avatarPreset()` in firestore.rules.
    nonisolated static let presets = ["hare", "tortoise", "cat", "dog", "bear", "bird", "fish", "leaf", "star", "moon", "sun", "bolt"]
    nonisolated static let presetScheme = "avatar-preset"

    nonisolated static func presetURL(_ name: String) -> URL? {
        presets.contains(name) ? URL(string: "\(presetScheme):\(name)") : nil
    }

    nonisolated static func presetName(_ url: URL?) -> String? {
        guard let url, url.scheme == presetScheme else { return nil }
        let name = String(url.absoluteString.dropFirst(presetScheme.count + 1))
        return presets.contains(name) ? name : nil
    }

    /// Resolves profile fields into something `LociAvatar` can draw. Only server-screened storage
    /// photos are shown; any other URL (legacy or external) is ignored.
    nonisolated static func resolve(avatarURL raw: String?, preset: String?) async -> URL? {
        if let raw, raw.hasPrefix("storage://avatars/"),
           let url = URL(string: raw), StorageAssetReference(url: url) != nil {
            return url
        }
        return preset.flatMap(presetURL)
    }

    /// Square-crops and downsizes to at most 1024 px, JPEG ≤ 3 MB (Storage rule limit).
    nonisolated static func preparedJPEG(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let side = min(image.size.width, image.size.height)
        guard side > 0 else { return nil }
        let target = min(side, 1024)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: target, height: target), format: format)
        let scaled = renderer.image { _ in
            let scale = target / side
            let drawSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: CGRect(
                x: (target - drawSize.width) / 2,
                y: (target - drawSize.height) / 2,
                width: drawSize.width,
                height: drawSize.height
            ))
        }
        for quality in [0.85, 0.7, 0.5] {
            if let jpeg = scaled.jpegData(compressionQuality: quality), jpeg.count < 3 * 1024 * 1024 { return jpeg }
        }
        return nil
    }
}

@MainActor
final class AvatarURLCache {
    static let shared = AvatarURLCache()
    private var generation = UUID()
    func clear() { generation = UUID(); ClientReadCaches.avatars.clear() }
    func data(for locator: URL) async -> Data? {
        guard let owner = FirebaseIdentity.currentLUID(), let reference = StorageAssetReference(url: locator), reference.bucket == "avatars" else { return nil }
        let expected = generation, session = ClientReadCaches.generation
        let ref = MediaAssetStore.storageReference(reference)
        // Re-check authorization even on a cache hit. Removed photos and changed accounts
        // cannot reuse a global permanent download URL.
        guard let metadata = try? await ref.getMetadata(), metadata.size > 0, metadata.size < 3 * 1_024 * 1_024,
              generation == expected, ClientReadCaches.generation == session, FirebaseIdentity.currentLUID() == owner else { return nil }
        guard metadata.generation > 0 else {
            // Without an object generation there is no safe reusable byte identity.
            guard let data = try? await ref.data(maxSize: 3 * 1_024 * 1_024),
                  !Task.isCancelled, generation == expected, ClientReadCaches.generation == session,
                  FirebaseIdentity.currentLUID() == owner else { return nil }
            return data
        }
        let key = owner.uuidString + ":" + locator.absoluteString + ":" + String(metadata.generation)
        guard let data = try? await ClientReadCaches.avatars.value(for: key, ttl: 86_400, cost: { $0.count }, load: {
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            let data = try await ref.data(maxSize: 3 * 1_024 * 1_024)
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            return data
        }), !Task.isCancelled, generation == expected, ClientReadCaches.generation == session,
            FirebaseIdentity.currentLUID() == owner else { return nil }
        return data
    }
}
