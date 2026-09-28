import Foundation
import SwiftData

@MainActor
enum LegacyMigrationCoordinator {
    static func run(modelContext: ModelContext) throws {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return
        }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        let importer = LegacyAsyncStorageImporter()
        let result = try importer.importIfNeeded(applicationSupportURL: support, documentsURL: documents)
        guard !result.values.isEmpty else {
            importer.markCompleted()
            return
        }

        for (key, data) in result.values {
            if key.hasPrefix("lociar_posts_v4_mockup"),
               let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                for row in rows {
                    let id = (row["id"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()
                    let payload = try JSONSerialization.data(withJSONObject: row)
                    let ownerID = (row["creator_id"] as? String).flatMap(UUID.init(uuidString:))
                    modelContext.insert(DraftRecord(id: id, ownerID: ownerID, payload: payload))
                }
            } else if key.hasPrefix("lociar_pending_sync") || key.hasPrefix("lociar_dead_letter_sync") {
                try importLegacyQueue(data, deadLetter: key.hasPrefix("lociar_dead_letter_sync"), modelContext: modelContext)
            } else if let value = String(data: data, encoding: .utf8) {
                modelContext.insert(PreferenceRecord(key: "legacy.\(key)", value: value))
            }
        }
        try modelContext.save()
        importer.markCompleted()
    }

    private static func importLegacyQueue(_ data: Data, deadLetter: Bool, modelContext: ModelContext) throws {
        guard let actions = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let iso = ISO8601DateFormatter()

        for action in actions where action["type"] as? String == "addPost" {
            guard var legacy = action["data"] as? [String: Any] else { continue }
            let id = (action["clientMutationId"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()
            legacy["id"] = id.uuidString
            legacy["creator_id"] = action["userId"] as? String ?? UUID().uuidString
            legacy["created_at"] = action["createdAt"] as? String ?? iso.string(from: Date())
            legacy["edit_data"] = legacy.removeValue(forKey: "editData")
            legacy["content_source"] = legacy.removeValue(forKey: "contentSource")
            legacy["age_rating"] = legacy.removeValue(forKey: "ageRating") ?? "all"
            legacy["anchor_bundle"] = legacy.removeValue(forKey: "anchorBundle")
            legacy["status"] = "pending_review"
            legacy["views_count"] = 0; legacy["likes_count"] = 0; legacy["comments_count"] = 0

            let rowData = try JSONSerialization.data(withJSONObject: legacy)
            let post = try decoder.decode(BackendPostRow.self, from: rowData).domainPost()
            let payload = try encoder.encode(post)
            let attempts = action["attemptCount"] as? Int ?? 0
            let nextDate = (action["nextRetryAt"] as? String).flatMap(iso.date(from:)) ?? Date()
            let record = SyncQueueRecord(
                id: id,
                ownerID: post.creatorID,
                operation: "publish_post",
                payload: payload,
                attemptCount: attempts,
                nextAttemptAt: nextDate
            )
            if deadLetter { record.deadLetterReason = action["lastError"] as? String ?? "Legacy dead-letter" }
            modelContext.insert(record)
        }
    }
}
