import Foundation

/// Memory only. Presentation results and successful receipts never grant content access.
/// Clearing changes the generation, so a late network result cannot refill a former session.
@MainActor
final class ClientRequestCache<Value: Sendable> {
    private struct Entry { let value: Value; let expires: TimeInterval; let bytes: Int; var used: UInt64 }
    private struct Flight { let id: UUID; let task: Task<Value, Error> }
    private var entries: [String: Entry] = [:]
    private var flights: [String: Flight] = [:]
    private var capacityWaiters: [UUID: CheckedContinuation<Void, Never>] = [:]
    private var generation = UUID()
    private var use: UInt64 = 0
    private(set) var byteCount = 0
    private let maxEntries: Int
    private let maxBytes: Int
    private let maxPending: Int
    private let now: () -> TimeInterval

    init(maxEntries: Int, maxBytes: Int, maxPending: Int = 8,
         now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.maxEntries = max(1, maxEntries); self.maxBytes = max(1, maxBytes)
        self.maxPending = max(1, maxPending); self.now = now
    }

    func cachedValue(for key: String) -> Value? {
        guard var entry = entries[key] else { return nil }
        guard entry.expires > now() else { remove(key); return nil }
        use &+= 1; entry.used = use; entries[key] = entry
        return entry.value
    }

    func value(for key: String, ttl: TimeInterval, cost: @escaping @Sendable (Value) -> Int,
               load: @escaping @Sendable () async throws -> Value) async throws -> Value {
        let expected = generation
        while true {
            try Task.checkCancellation()
            guard generation == expected else { throw CancellationError() }
            if let hit = cachedValue(for: key) { return hit }
            if flights[key] != nil || flights.count < maxPending { break }
            // Backpressure instead of starting an unbounded set of distinct downloads.
            await waitForCapacity(for: key)
        }
        let flight: Flight
        if let existing = flights[key] { flight = existing }
        else {
            flight = Flight(id: UUID(), task: Task { try await load() })
            flights[key] = flight
        }
        do {
            let value = try await flight.task.value
            guard generation == expected else { throw CancellationError() }
            if flights[key]?.id == flight.id {
                flights.removeValue(forKey: key)
                wakeCapacityWaiters()
                let bytes = max(1, cost(value))
                if bytes <= maxBytes && ttl > 0 {
                    while entries.count >= maxEntries || byteCount + bytes > maxBytes {
                        guard let oldest = entries.min(by: { $0.value.used < $1.value.used })?.key else { break }
                        remove(oldest)
                    }
                    use &+= 1
                    entries[key] = Entry(value: value, expires: now() + ttl, bytes: bytes, used: use)
                    byteCount += bytes
                }
            }
            try Task.checkCancellation()
            return value
        } catch {
            if flights[key]?.id == flight.id { flights.removeValue(forKey: key); wakeCapacityWaiters() }
            throw error
        }
    }

    private func remove(_ key: String) {
        if let entry = entries.removeValue(forKey: key) { byteCount -= entry.bytes }
    }

    private func waitForCapacity(for key: String) async {
        let id = UUID()
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if Task.isCancelled || flights[key] != nil || flights.count < maxPending { continuation.resume() }
                else { capacityWaiters[id] = continuation }
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.capacityWaiters.removeValue(forKey: id)?.resume() }
        }
    }

    private func wakeCapacityWaiters() {
        let waiting = capacityWaiters.values
        capacityWaiters.removeAll()
        waiting.forEach { $0.resume() }
    }

    func clear() {
        generation = UUID()
        flights.values.forEach { $0.task.cancel() }
        flights.removeAll(); entries.removeAll(); byteCount = 0
        wakeCapacityWaiters()
    }
}

@MainActor
enum ClientReadCaches {
    static let gifs = ClientRequestCache<GifSearchPage>(maxEntries: 24, maxBytes: 256 * 1_024)
    static let views = ClientRequestCache<Int>(maxEntries: 512, maxBytes: 16 * 1_024)
    static let avatars = ClientRequestCache<Data>(maxEntries: 64, maxBytes: 16 * 1_024 * 1_024)
    private static var viewer: UUID?
    private(set) static var generation = UUID()

    static func setViewer(_ next: UUID?) {
        guard next != viewer else { return }
        viewer = next; clear()
    }
    static func clear() { generation = UUID(); gifs.clear(); views.clear(); avatars.clear() }

    /// A remembered receipt suppresses a repeat mutation, but its old count is not current data.
    static func recordView(owner: UUID, post: UUID, date: Date = Date(),
                           load: @escaping @Sendable () async throws -> Int) async throws -> Int? {
        let day = Int(date.timeIntervalSince1970 / 86_400)
        let key = "\(owner.uuidString)|\(post.uuidString)|\(day)"
        if views.cachedValue(for: key) != nil { return nil }
        return try await views.value(for: key, ttl: max(1, Double(day + 1) * 86_400 - date.timeIntervalSince1970),
                                     cost: { _ in 24 }, load: load)
    }
}
