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
