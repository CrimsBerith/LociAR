import Compression
import CryptoKit
import Foundation

/// Storage format for world maps. Uploads are LZFSE-compressed behind a 4-byte magic header
/// ("LZM1"); files without the header are pre-compression uploads and are returned unchanged, so
/// old posts keep working. Local draft files stay uncompressed.
enum WorldMapCodec {
    nonisolated static let magic = Data("LZM1".utf8)
    /// Upper bound for an uploaded (compressed) map; storage.rules enforces the same limit.
    nonisolated static let maximumUploadBytes = 20 * 1_024 * 1_024

    nonisolated static let maximumDecodedBytes = 50 * 1_024 * 1_024

    enum CodecError: LocalizedError {
        case tooLarge(bytes: Int)
        case corrupt

        var errorDescription: String? {
            switch self {
            case .tooLarge:
                String(localized: "Yüzey haritası çok büyük. Daha küçük bir alanı tarayıp yeniden sabitle.")
            case .corrupt:
                String(localized: "Kaydedilmiş yüzey bilgisi açılamadı.")
            }
        }
    }

    nonisolated static func encode(_ raw: Data) throws -> Data {
        guard raw.count <= maximumDecodedBytes else { throw CodecError.tooLarge(bytes: raw.count) }
        let compressed = try (raw as NSData).compressed(using: .lzfse) as Data
        return magic + compressed
    }

    nonisolated static func decode(_ stored: Data) throws -> Data {
        guard stored.starts(with: magic) else {
            guard stored.count <= maximumDecodedBytes else { throw CodecError.tooLarge(bytes: stored.count) }
            return stored
        }
        guard stored.count <= maximumUploadBytes else { throw CodecError.tooLarge(bytes: stored.count) }
        return try stored.dropFirst(magic.count).withUnsafeBytes { source in
            guard let base = source.bindMemory(to: UInt8.self).baseAddress else { throw CodecError.corrupt }
            // compression_stream has non-optional pointer fields, so Swift offers no empty initializer:
            // allocate it and let compression_stream_init fill it in.
            let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
            defer { stream.deallocate() }
            guard compression_stream_init(stream, COMPRESSION_STREAM_DECODE, COMPRESSION_LZFSE) != COMPRESSION_STATUS_ERROR else { throw CodecError.corrupt }
            defer { compression_stream_destroy(stream) }
            let capacity = 64 * 1_024
            let output = UnsafeMutablePointer<UInt8>.allocate(capacity: capacity)
            defer { output.deallocate() }
            stream.pointee.src_ptr = base
            stream.pointee.src_size = source.count
            var decoded = Data()
            while true {
                stream.pointee.dst_ptr = output
                stream.pointee.dst_size = capacity
                let oldInputSize = stream.pointee.src_size
                let status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
                let produced = capacity - stream.pointee.dst_size
                guard decoded.count + produced <= maximumDecodedBytes else { throw CodecError.tooLarge(bytes: decoded.count + produced) }
                decoded.append(output, count: produced)
                if status == COMPRESSION_STATUS_END {
                    guard stream.pointee.src_size == 0 else { throw CodecError.corrupt }
                    return decoded
                }
                guard status == COMPRESSION_STATUS_OK, produced > 0 || stream.pointee.src_size < oldInputSize else { throw CodecError.corrupt }
            }
        }
    }
}

/// On-device cache of downloaded world maps so opening the same post again does not download it
/// again (world maps are the largest egress item). Lives in Caches: iOS may purge it at any time,
/// in which case the map is simply downloaded again.
struct WorldMapDownloadCache: Sendable {
    private final class Lifecycle: @unchecked Sendable {
        let lock = NSLock()
        var generations: [String: UUID] = [:]
        var blocked: Set<String> = []
    }
    private nonisolated static let lifecycle = Lifecycle()
    nonisolated static let maximumBytes = 200 * 1_024 * 1_024
    let directory: URL
    private let generation: UUID
    private let owner: UUID?

    nonisolated init(directory: URL, owner: UUID? = nil) {
        self.directory = directory.standardizedFileURL
        self.owner = owner
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        let key = self.directory.path
        let token = Self.lifecycle.generations[key] ?? UUID()
        Self.lifecycle.generations[key] = token
        generation = token
    }

    private nonisolated var validLocked: Bool {
        !Task.isCancelled && !Self.lifecycle.blocked.contains(directory.path)
            && Self.lifecycle.generations[directory.path] == generation
            && (owner == nil || FirebaseIdentity.currentLUID() == owner)
    }

    nonisolated var isCurrent: Bool {
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        return validLocked
    }

    nonisolated static func accountDirectory(_ owner: UUID) -> URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("LociARWorldMaps", isDirectory: true)
            .appendingPathComponent(owner.uuidString.lowercased(), isDirectory: true)
    }

    /// Invalidates captured download handles before the deletion UI can dismiss.
    nonisolated static func block(owner: UUID) {
        guard let directory = accountDirectory(owner) else { return }
        lifecycle.lock.lock()
        defer { lifecycle.lock.unlock() }
        lifecycle.blocked.insert(directory.path)
        lifecycle.generations[directory.path] = UUID()
    }

    /// Cache commits and deletion share one lock: a late SDK completion cannot recreate files.
    nonisolated func removeAll() throws {
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        Self.lifecycle.blocked.insert(directory.path)
        Self.lifecycle.generations[directory.path] = UUID()
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    nonisolated static var standard: WorldMapDownloadCache? {
        guard let owner = FirebaseIdentity.currentLUID(), let directory = accountDirectory(owner) else { return nil }
        let cache = WorldMapDownloadCache(directory: directory, owner: owner)
        return cache.isCurrent ? cache : nil
    }

    /// Stable file name for a `storage://` locator (the path contains the post and anchor IDs).
    nonisolated static func fileName(for locator: String) -> String {
        SHA256.hash(data: Data(locator.utf8)).map { String(format: "%02x", $0) }.joined() + ".lociarmap"
    }

    nonisolated func read(_ locator: String) -> Data? {
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        guard validLocked else { return nil }
        let url = directory.appendingPathComponent(Self.fileName(for: locator))
        guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size <= WorldMapCodec.maximumUploadBytes,
              let data = try? Data(contentsOf: url), data.count >= 64 else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        return data
    }

    @discardableResult nonisolated func write(_ data: Data, for locator: String) -> Bool {
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        guard validLocked else { return false }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent(Self.fileName(for: locator)), options: .atomic)
        pruneLocked(limit: Self.maximumBytes)
        return true
    }

    /// Keeps the cache under `maximumBytes`, deleting least recently used files first.
    nonisolated func prune(limit: Int = WorldMapDownloadCache.maximumBytes) {
        Self.lifecycle.lock.lock()
        defer { Self.lifecycle.lock.unlock() }
        guard validLocked else { return }
        pruneLocked(limit: limit)
    }

    private nonisolated func pruneLocked(limit: Int) {
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
