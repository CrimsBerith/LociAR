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

    /// Resolves profile fields into something `LociAvatar` can draw. Supports server-screened storage
    /// photos, external / admin web URLs, and presets.
    nonisolated static func resolve(avatarURL raw: String?, preset: String?) async -> URL? {
        if let raw {
            if raw.hasPrefix("storage://avatars/"),
               let url = URL(string: raw), StorageAssetReference(url: url) != nil {
                return url
            }
            if (raw.hasPrefix("https://") || raw.hasPrefix("http://")),
               let url = URL(string: raw) {
                return url
            }
            if raw.hasPrefix(presetScheme + ":"),
               let name = presetName(URL(string: raw)),
               let url = presetURL(name) {
                return url
            }
            if presets.contains(raw), let url = presetURL(raw) {
                return url
            }
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
    /// A Storage authorization check (getMetadata) is reused this long, so a list of avatars does not make one
    /// network call per row on every appearance. A removed photo stops showing within this window.
    nonisolated static let verificationTTL: TimeInterval = 300
    nonisolated static let maxVerifiedEntries = 500
    private struct Verified { let objectGeneration: Int64; let at: Date }
    private var verified: [String: Verified] = [:]
    private var generation = UUID()
    func clear() { generation = UUID(); verified.removeAll(); ClientReadCaches.avatars.clear() }

    /// Object generation of a recent successful authorization check, or nil when a new check is needed.
    private func recentVerification(_ key: String, now: Date) -> Int64? {
        guard let entry = verified[key] else { return nil }
        guard now.timeIntervalSince(entry.at) < Self.verificationTTL, now >= entry.at else { verified[key] = nil; return nil }
        return entry.objectGeneration
    }

    private func remember(_ key: String, objectGeneration: Int64, now: Date) {
        verified[key] = Verified(objectGeneration: objectGeneration, at: now)
        guard verified.count > Self.maxVerifiedEntries else { return }
        for old in verified.sorted(by: { $0.value.at < $1.value.at }).prefix(100) { verified[old.key] = nil }
    }

    func data(for locator: URL) async -> Data? {
        guard let owner = FirebaseIdentity.currentLUID(), let reference = StorageAssetReference(url: locator), reference.bucket == "avatars" else { return nil }
        let expected = generation, session = ClientReadCaches.generation
        let ref = MediaAssetStore.storageReference(reference)
        let verificationKey = owner.uuidString + ":" + locator.absoluteString
        func cachedBytes(objectGeneration: Int64) async -> Data? {
            let key = verificationKey + ":" + String(objectGeneration)
            guard let data = try? await ClientReadCaches.avatars.value(for: key, ttl: 86_400, cost: { $0.count }, load: {
                guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
                let data = try await ref.data(maxSize: 3 * 1_024 * 1_024)
                guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
                return data
            }), !Task.isCancelled, generation == expected, ClientReadCaches.generation == session,
                FirebaseIdentity.currentLUID() == owner else { return nil }
            return data
        }
        if let objectGeneration = recentVerification(verificationKey, now: Date()) {
            if let data = await cachedBytes(objectGeneration: objectGeneration) { return data }
            guard !Task.isCancelled, generation == expected else { return nil }
            // A failed read means the object may be gone or no longer readable: check again below.
            verified[verificationKey] = nil
        }
        // Re-check authorization when no recent check exists. Removed photos and changed accounts
        // cannot reuse a global permanent download URL.
        guard let metadata = try? await ref.getMetadata(), metadata.size > 0, metadata.size < 3 * 1_024 * 1_024,
              generation == expected, ClientReadCaches.generation == session, FirebaseIdentity.currentLUID() == owner else {
            if generation == expected { verified[verificationKey] = nil }
            return nil
        }
        if metadata.generation > 0 { remember(verificationKey, objectGeneration: metadata.generation, now: Date()) }
        guard metadata.generation > 0 else {
            // Without an object generation there is no safe reusable byte identity.
            guard let data = try? await ref.data(maxSize: 3 * 1_024 * 1_024),
                  !Task.isCancelled, generation == expected, ClientReadCaches.generation == session,
                  FirebaseIdentity.currentLUID() == owner else { return nil }
            return data
        }
        return await cachedBytes(objectGeneration: metadata.generation)
    }
}
