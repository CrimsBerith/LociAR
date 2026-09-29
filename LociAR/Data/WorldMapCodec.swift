import CryptoKit
import Foundation

/// Storage format for world maps. Uploads are LZFSE-compressed behind a 4-byte magic header
/// ("LZM1"); files without the header are pre-compression uploads and are returned unchanged, so
/// old posts keep working. Local draft files stay uncompressed.
enum WorldMapCodec {
    nonisolated static let magic = Data("LZM1".utf8)
    /// Upper bound for an uploaded (compressed) map; storage.rules enforces the same limit.
    nonisolated static let maximumUploadBytes = 20 * 1_024 * 1_024

    enum CodecError: LocalizedError {
        case tooLarge(bytes: Int)
        case corrupt

        var errorDescription: String? {
            switch self {
            case .tooLarge:
                "Yüzey haritası çok büyük. Daha küçük bir alanı tarayıp yeniden sabitle."
            case .corrupt:
                "Kaydedilmiş yüzey bilgisi açılamadı."
            }
        }
    }

    nonisolated static func encode(_ raw: Data) throws -> Data {
        let compressed = try (raw as NSData).compressed(using: .lzfse) as Data
        return magic + compressed
    }

    nonisolated static func decode(_ stored: Data) throws -> Data {
        guard stored.starts(with: magic) else { return stored }
        do {
            return try (stored.dropFirst(magic.count) as NSData).decompressed(using: .lzfse) as Data
        } catch {
            throw CodecError.corrupt
        }
    }
}

/// On-device cache of downloaded world maps so opening the same post again does not download it
/// again (world maps are the largest egress item). Lives in Caches: iOS may purge it at any time,
/// in which case the map is simply downloaded again.
struct WorldMapDownloadCache: Sendable {
    nonisolated static let maximumBytes = 200 * 1_024 * 1_024
    let directory: URL

    nonisolated static var standard: WorldMapDownloadCache? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            .map { WorldMapDownloadCache(directory: $0.appendingPathComponent("LociARWorldMaps", isDirectory: true)) }
    }

    /// Stable file name for a `storage://` locator (the path contains the post and anchor IDs).
    nonisolated static func fileName(for locator: String) -> String {
        SHA256.hash(data: Data(locator.utf8)).map { String(format: "%02x", $0) }.joined() + ".lociarmap"
    }

    nonisolated func read(_ locator: String) -> Data? {
        let url = directory.appendingPathComponent(Self.fileName(for: locator))
        guard let data = try? Data(contentsOf: url), data.count >= 64 else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        return data
    }

    nonisolated func write(_ data: Data, for locator: String) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent(Self.fileName(for: locator)), options: .atomic)
        prune()
    }

    /// Keeps the cache under `maximumBytes`, deleting least recently used files first.
    nonisolated func prune(limit: Int = WorldMapDownloadCache.maximumBytes) {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys) else { return }
        let entries = files.compactMap { url -> (URL, Int, Date)? in
            guard let values = try? url.resourceValues(forKeys: Set(keys)) else { return nil }
            return (url, values.fileSize ?? 0, values.contentModificationDate ?? .distantPast)
        }
        var total = entries.reduce(0) { $0 + $1.1 }
        for entry in entries.sorted(by: { $0.2 < $1.2 }) where total > limit {
            try? FileManager.default.removeItem(at: entry.0)
            total -= entry.1
        }
    }
}
