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
                // Drafts are read back as encoded LociPost (Discover, AR, Notlarım). A raw legacy
                // dictionary never decodes there, so convert each row; one that can't be is skipped
                // rather than stored as an undecodable record that still fills draft fetch limits.
                for row in rows {
                    guard let post = legacyDraftPost(row) else { continue }
                    modelContext.insert(DraftRecord(id: post.id, ownerID: post.creatorID, payload: try draftEncoder.encode(post)))
                }
            } else if key.hasPrefix("lociar_pending_sync") || key.hasPrefix("lociar_dead_letter_sync") {
                try importLegacyQueue(data, deadLetter: key.hasPrefix("lociar_dead_letter_sync"), modelContext: modelContext)
            } else if key == "lociar_theme_mode_v1" {
                if UserDefaults.standard.object(forKey: LociAppearancePreference.storageKey) == nil,
                   let appearance = Self.importedAppearancePreference(from: data) {
                    UserDefaults.standard.set(appearance, forKey: LociAppearancePreference.storageKey)
                }
            } else if let value = String(data: data, encoding: .utf8) {
                modelContext.insert(PreferenceRecord(key: "legacy.\(key)", value: value))
            }
        }
        try modelContext.save()
        importer.markCompleted()
    }

    private static var draftEncoder: JSONEncoder {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    /// A legacy local post row (snake_case, possibly with the RN app's camelCase fields) as a LociPost.
    static func legacyDraftPost(_ row: [String: Any]) -> LociPost? {
        var legacy = row
        for (camel, snake) in [("editData", "edit_data"), ("contentSource", "content_source"), ("ageRating", "age_rating"),
                               ("anchorBundle", "anchor_bundle"), ("creatorId", "creator_id"), ("createdAt", "created_at")] {
            if legacy[snake] == nil, let value = legacy.removeValue(forKey: camel) { legacy[snake] = value }
        }
        guard (legacy["id"] as? String).flatMap(UUID.init(uuidString:)) != nil,
              (legacy["creator_id"] as? String).flatMap(UUID.init(uuidString:)) != nil else { return nil }
        legacy["age_rating"] = legacy["age_rating"] ?? "all"
        legacy["status"] = "draft" // never published to the server, whatever the mockup row claimed
        legacy["created_at"] = legacy["created_at"] ?? ISO8601DateFormatter().string(from: Date())
        for counter in ["views_count", "likes_count", "comments_count"] { legacy[counter] = legacy[counter] ?? 0 }
        guard JSONSerialization.isValidJSONObject(legacy),
              let data = try? JSONSerialization.data(withJSONObject: legacy) else { return nil }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(BackendPostRow.self, from: data).domainPost()
    }

    static func importedAppearancePreference(from data: Data) -> String? {
        let value = (try? JSONDecoder().decode(String.self, from: data))
            ?? String(data: data, encoding: .utf8)
        guard let value else { return nil }
        switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "system", "auto", "automatic": return LociAppearancePreference.system.rawValue
        case "light", "day": return LociAppearancePreference.light.rawValue
        case "dark", "night": return LociAppearancePreference.dark.rawValue
        default: return nil
        }
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
