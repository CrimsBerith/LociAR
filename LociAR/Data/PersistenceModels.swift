import Foundation
import SwiftData

@Model
final class DraftRecord {
    @Attribute(.unique) var id: UUID
    var ownerID: UUID?
    var payload: Data
    var updatedAt: Date

    init(id: UUID, ownerID: UUID? = nil, payload: Data, updatedAt: Date = Date()) {
        self.id = id
        self.ownerID = ownerID
        self.payload = payload
        self.updatedAt = updatedAt
    }
}

@Model
final class SyncQueueRecord {
    @Attribute(.unique) var id: UUID
    var ownerID: UUID?
    var operation: String
    var payload: Data
    var attemptCount: Int
    var nextAttemptAt: Date
    var deadLetterReason: String?
    var lastErrorMessage: String?

    init(
        id: UUID = UUID(), ownerID: UUID? = nil, operation: String, payload: Data, attemptCount: Int = 0,
        nextAttemptAt: Date = Date(), lastErrorMessage: String? = nil
    ) {
        self.id = id
        self.ownerID = ownerID
        self.operation = operation
        self.payload = payload
        self.attemptCount = attemptCount
        self.nextAttemptAt = nextAttemptAt
        self.lastErrorMessage = lastErrorMessage
    }
}

@Model
final class PreferenceRecord {
    @Attribute(.unique) var key: String
    var value: String

    init(key: String, value: String) {
        self.key = key
        self.value = value
    }
}

/// Accepted deletion persists a local tombstone before any UI dismissal. Cleanup can resume
/// at launch and only removes records/assets whose payload belongs to that account.
@MainActor
enum LocalAccountDeletion {
    private static let key = "lociar.acceptedAccountDeletions"
    static func markAccepted(_ owner: UUID) {
        var ids = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        ids.insert(owner.uuidString.lowercased())
        UserDefaults.standard.set(Array(ids), forKey: key)
    }
    private static func ownsPreference(_ key: String, owner: UUID) -> Bool {
        if key.hasPrefix(owner.uuidString.lowercased() + ".") { return true }
        // Retired AsyncStorage settings sometimes carry the owner in their original key.
        guard key.hasPrefix("legacy."), let delimiter = key.range(of: ":user:") else { return false }
        return UUID(uuidString: String(key[delimiter.upperBound...])) == owner
    }
    static func resume(in context: ModelContext) async {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for raw in UserDefaults.standard.stringArray(forKey: key) ?? [] {
            guard let owner = UUID(uuidString: raw) else { continue }
            do {
                let drafts = try context.fetch(FetchDescriptor<DraftRecord>())
                let queues = try context.fetch(FetchDescriptor<SyncQueueRecord>())
                var owned: [UUID: LociPost] = [:]
                var ownedDrafts: [DraftRecord] = []
                var ownedQueues: [SyncQueueRecord] = []
                for draft in drafts {
                    let post = (try? decoder.decode(LociPost.self, from: draft.payload))
                        ?? (try? FirestoreJSON.decoder().decode(BackendPostRow.self, from: draft.payload))?.domainPost()
                    if draft.ownerID == owner || (draft.ownerID == nil && post?.creatorID == owner) {
                        if let post { owned[post.id] = post }
                        ownedDrafts.append(draft)
                    }
                }
                for queue in queues {
                    let post = (try? decoder.decode(LociPost.self, from: queue.payload))
                        ?? (try? FirestoreJSON.decoder().decode(BackendPostRow.self, from: queue.payload))?.domainPost()
                    if queue.ownerID == owner || (queue.ownerID == nil && post?.creatorID == owner) {
                        if let post { owned[post.id] = post }
                        ownedQueues.append(queue)
                    }
                }
                // Delete owned files before committing removal of their locator records. A crash
                // before save leaves these records available to repeat this exact cleanup.
                for post in owned.values { try await MediaAssetStore.removeLocalAssetsChecked(in: post) }
                ownedDrafts.forEach { context.delete($0) }
                ownedQueues.forEach { context.delete($0) }
                for preference in try context.fetch(FetchDescriptor<PreferenceRecord>()) where ownsPreference(preference.key, owner: owner) {
                    context.delete(preference)
                }
                try context.save()
                await HiddenPostStore.shared.clear(owner: raw)
                await BlockListCache.shared.invalidate()
                await AvatarURLCache.shared.clear()
                if let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                    let accountCache = caches.appendingPathComponent("LociARWorldMaps", isDirectory: true).appendingPathComponent(raw, isDirectory: true)
                    if FileManager.default.fileExists(atPath: accountCache.path) { try FileManager.default.removeItem(at: accountCache) }
                    // Retired cache used unscoped filenames. It is a disposable download cache;
                    // staged drafts belonging to other accounts are never removed here.
                    let old = caches.appendingPathComponent("LociARWorldMaps", isDirectory: true)
                    for file in (try? FileManager.default.contentsOfDirectory(at: old, includingPropertiesForKeys: nil)) ?? [] where file.pathExtension == "lociarmap" {
                        try FileManager.default.removeItem(at: file)
                    }
                }
                var pending = UserDefaults.standard.stringArray(forKey: key) ?? []
                pending.removeAll { $0 == raw }
                UserDefaults.standard.set(pending, forKey: key)
            } catch {
                context.rollback() // Preserve locator records and the owner tombstone for retry.
            }
        }
    }
}
