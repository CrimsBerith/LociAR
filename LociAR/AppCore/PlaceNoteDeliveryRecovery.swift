import Foundation

/// Account-scoped random IDs only. Captions and GPS fixes are never retained here.
struct PlaceNoteDeliveryAttempt: Codable, Equatable {
    static let retryLifetime: TimeInterval = 86_400 // functions/src/placeNoteRules.ts
    let deliveryID: UUID
    let createdAt: Date
    var queuedActivityID: String?
    func isUsable(at now: Date) -> Bool { now.timeIntervalSince(createdAt) >= -10 && now.timeIntervalSince(createdAt) < Self.retryLifetime }

    static func expiredRegions(in attempts: [UUID: Self], at now: Date) -> Set<UUID> {
        Set(attempts.filter { !$0.value.isUsable(at: now) }.keys)
    }
}

/// Runs beside region refresh. Bounded batches and cooldown prevent an unavailable ACK
/// endpoint from delaying fresh geofences or starting an unbounded retry loop.
@MainActor
final class PlaceNoteAcknowledgementPump {
    private var task: Task<Void, Never>?
    private var token = UUID()
    private var nextAttempt: [UUID: Date] = [:]
    private let clock: @MainActor () -> Date
    var isRunning: Bool { task != nil }

    init(clock: @escaping @MainActor () -> Date = { Date() }) { self.clock = clock }

    func schedule(_ ids: [UUID], send: @escaping @MainActor (UUID) async -> Bool) {
        guard task == nil else { return }
        let queued = Set(ids)
        let now = clock()
        nextAttempt = nextAttempt.filter { queued.contains($0.key) }
        let batch = Array(ids.filter { now >= nextAttempt[$0] ?? .distantPast }.prefix(3))
        guard !batch.isEmpty else { return }
        let epoch = UUID(); token = epoch
        task = Task { [weak self] in
            guard let self else { return }
            defer { if self.token == epoch { self.task = nil } }
            for id in batch {
                guard self.token == epoch, !Task.isCancelled else { return }
                let succeeded = await send(id)
                guard self.token == epoch, !Task.isCancelled else { return }
                if succeeded { self.nextAttempt.removeValue(forKey: id) }
                else { self.nextAttempt[id] = self.clock().addingTimeInterval(60) }
            }
        }
    }

    func cancel() {
        token = UUID(); task?.cancel(); task = nil; nextAttempt.removeAll()
    }
}
