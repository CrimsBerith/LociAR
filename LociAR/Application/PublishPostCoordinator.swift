import Foundation
import OSLog
import SwiftData

enum PublishDeferralReason: Equatable, Sendable {
    case offline
    case backendUnavailable
}

enum PublishOutcome: Equatable, Sendable {
    case published(PostPublishReceipt)
    case queued(PublishDeferralReason)
    case rejected(String)
}

@MainActor
protocol PublishPostUseCase: Sendable {
    func submit(_ post: LociPost, attemptRemote: Bool, modelContext: ModelContext) async throws -> PublishOutcome
}

@MainActor
final class PublishPostCoordinator: PublishPostUseCase {
    private let postRepository: any PostRepository
    private let logger = Logger(subsystem: "com.khankartal.lociar", category: "publish")

    init(postRepository: any PostRepository) { self.postRepository = postRepository }

    func submit(_ post: LociPost, attemptRemote: Bool, modelContext: ModelContext) async throws -> PublishOutcome {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(post)

        let postID = post.id
        let draftDescriptor = FetchDescriptor<DraftRecord>(predicate: #Predicate { $0.id == postID })
        if let draft = try modelContext.fetch(draftDescriptor).first {
            draft.ownerID = post.creatorID
            draft.payload = payload
            draft.updatedAt = Date()
        } else {
            modelContext.insert(DraftRecord(id: postID, ownerID: post.creatorID, payload: payload))
        }

        let queueDescriptor = FetchDescriptor<SyncQueueRecord>(predicate: #Predicate { $0.id == postID })
        let queue: SyncQueueRecord
        if let existing = try modelContext.fetch(queueDescriptor).first {
            existing.ownerID = post.creatorID
            existing.operation = "publish_post"
            existing.payload = payload
            existing.attemptCount = 0
            existing.deadLetterReason = nil
            existing.lastErrorMessage = nil
            existing.nextAttemptAt = Date()
            queue = existing
        } else {
            queue = SyncQueueRecord(id: postID, ownerID: post.creatorID, operation: "publish_post", payload: payload)
            modelContext.insert(queue)
        }
        try modelContext.save()
        logger.info("Publish intent persisted post=\(postID.uuidString, privacy: .public)")

        guard attemptRemote else {
            logger.info("Publish queued post=\(postID.uuidString, privacy: .public) reason=offline")
            return .queued(.offline)
        }
        do {
            let receipt = try await postRepository.publish(post)
            await MediaAssetStore.removeLocalAssets(in: post)
            removePersistedWork(postID: postID, modelContext: modelContext)
            try modelContext.save()
            logger.info("Publish committed post=\(postID.uuidString, privacy: .public)")
            return .published(receipt)
        } catch let error as PostPublishError {
            let message = error.localizedDescription
            queue.attemptCount = RetryPolicy.maximumAttempts
            queue.deadLetterReason = message
            queue.lastErrorMessage = message
            try modelContext.save()
            logger.error("Publish rejected post=\(postID.uuidString, privacy: .public) error=\(message, privacy: .public)")
            return .rejected(message)
        } catch {
            queue.attemptCount += 1
            queue.nextAttemptAt = Date().addingTimeInterval(RetryPolicy.delay(afterAttempt: queue.attemptCount))
            if RetryPolicy.shouldDeadLetter(afterAttempt: queue.attemptCount) {
                queue.deadLetterReason = error.localizedDescription
            }
            queue.lastErrorMessage = error.localizedDescription
            try modelContext.save()
            logger.error("Publish deferred post=\(postID.uuidString, privacy: .public) attempt=\(queue.attemptCount) error=\(error.localizedDescription, privacy: .public)")
            return .queued(.backendUnavailable)
        }
    }

    private func removePersistedWork(postID: UUID, modelContext: ModelContext) {
        let draftDescriptor = FetchDescriptor<DraftRecord>(predicate: #Predicate { $0.id == postID })
        let queueDescriptor = FetchDescriptor<SyncQueueRecord>(predicate: #Predicate { $0.id == postID })
        if let draft = try? modelContext.fetch(draftDescriptor).first { modelContext.delete(draft) }
        if let queue = try? modelContext.fetch(queueDescriptor).first { modelContext.delete(queue) }
    }
}
