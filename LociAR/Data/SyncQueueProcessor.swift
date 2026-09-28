import Foundation
import OSLog
import SwiftData

enum RetryPolicy {
    static let maximumAttempts = 5

    static func delay(afterAttempt attempt: Int) -> TimeInterval {
        min(3_600, pow(2, Double(max(0, attempt))) * 15)
    }

    static func shouldDeadLetter(afterAttempt attempt: Int) -> Bool { attempt >= maximumAttempts }
}

@MainActor
enum SyncQueueProcessor {
    private static var isProcessing = false
    private static let logger = Logger(subsystem: "com.khankartal.lociar", category: "sync")

    static func process(
        modelContext: ModelContext,
        repository: any PostRepository,
        authenticatedUserID: UUID? = nil,
        force: Bool = false
    ) async {
        guard !isProcessing else { return }
        isProcessing = true
        defer { isProcessing = false }
        let now = Date()
        let descriptor = force
            ? FetchDescriptor<SyncQueueRecord>(sortBy: [SortDescriptor(\.nextAttemptAt)])
            : FetchDescriptor<SyncQueueRecord>(
                predicate: #Predicate { $0.deadLetterReason == nil && $0.nextAttemptAt <= now },
                sortBy: [SortDescriptor(\.nextAttemptAt)]
            )
        guard let records = try? modelContext.fetch(descriptor) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for record in records where record.ownerID == nil {
            if let post = try? decoder.decode(LociPost.self, from: record.payload) {
                record.ownerID = post.creatorID
            }
        }
        try? modelContext.save()
        let ownedRecords = records.filter { record in
            guard let authenticatedUserID else { return false }
            return record.ownerID == authenticatedUserID
        }
        for record in ownedRecords.prefix(10) {
            guard !Task.isCancelled else { return }
            do {
                if force {
                    record.deadLetterReason = nil
                    record.nextAttemptAt = now
                }
                switch record.operation {
                case "publish_post":
                    let post = try decoder.decode(LociPost.self, from: record.payload)
                    guard post.creatorID == authenticatedUserID else { throw QueueError.creatorMismatch }
                    _ = try await repository.publish(post)
                    guard !Task.isCancelled else { return }
                    await MediaAssetStore.removeLocalAssets(in: post)
                    let postID = post.id
                    let draftDescriptor = FetchDescriptor<DraftRecord>(predicate: #Predicate { $0.id == postID })
                    if let draft = try modelContext.fetch(draftDescriptor).first { modelContext.delete(draft) }
                default:
                    throw QueueError.unknownOperation(record.operation)
                }
                logger.info("Sync committed operation=\(record.operation, privacy: .public) id=\(record.id.uuidString, privacy: .public)")
                modelContext.delete(record)
            } catch is CancellationError {
                return
            } catch let error as PostPublishError {
                record.attemptCount = RetryPolicy.maximumAttempts
                record.deadLetterReason = error.localizedDescription
                record.lastErrorMessage = error.localizedDescription
                logger.error("Sync rejected operation=\(record.operation, privacy: .public) id=\(record.id.uuidString, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            } catch {
                record.attemptCount += 1
                if RetryPolicy.shouldDeadLetter(afterAttempt: record.attemptCount) {
                    record.deadLetterReason = error.localizedDescription
                } else {
                    record.nextAttemptAt = Date().addingTimeInterval(RetryPolicy.delay(afterAttempt: record.attemptCount))
                }
                record.lastErrorMessage = error.localizedDescription
                logger.error("Sync deferred operation=\(record.operation, privacy: .public) id=\(record.id.uuidString, privacy: .public) attempt=\(record.attemptCount) error=\(error.localizedDescription, privacy: .public)")
            }
        }
        try? modelContext.save()
    }

    private enum QueueError: LocalizedError {
        case unknownOperation(String)
        case creatorMismatch
        var errorDescription: String? {
            switch self {
            case .unknownOperation(let operation): "Bilinmeyen sync işlemi: \(operation)"
            case .creatorMismatch: "Bu sıradaki post farklı bir hesaba ait."
            }
        }
    }
}
