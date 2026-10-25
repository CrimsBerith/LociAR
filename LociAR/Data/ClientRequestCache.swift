import Foundation
import Observation
import FirebaseFunctions

/// Dispatch policy only: no response bodies or authorization decisions are cached here.
@MainActor @Observable
final class ScreenRefreshGate {
    struct Ticket: Equatable { let id: UUID; let generation: UUID }
    private var scope: String?
    private var revision: UUID?
    private var generation = UUID()
    private var flight: Ticket?
    private var lastSuccess: TimeInterval = -.infinity
    private var lastAttempt: TimeInterval = -.infinity
    private var retryAt: TimeInterval = 0
    private var failures = 0
    private var automaticRetryStopped = false
    private var connectionFailure = false
    private let now: () -> TimeInterval
    let interval: TimeInterval

    init(interval: TimeInterval = 60, now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.interval = max(5, interval); self.now = now
    }

    @discardableResult
    func prepare(scope: String, revision: UUID) -> Bool {
        let changed = self.scope != scope || self.revision != revision
        if self.scope != scope {
            self.scope = scope; self.revision = revision; generation = UUID(); flight = nil
            lastSuccess = -.infinity; lastAttempt = -.infinity; retryAt = 0; failures = 0; automaticRetryStopped = false; connectionFailure = false
        } else if self.revision != revision {
            self.revision = revision; generation = UUID(); lastSuccess = -.infinity
            retryAt = 0; failures = 0; automaticRetryStopped = false; connectionFailure = false
        }
        return changed
    }

    func begin(scope: String, revision: UUID, force: Bool = false) -> Ticket? {
        prepare(scope: scope, revision: revision)
        guard flight == nil, now() >= lastAttempt + 5, now() >= retryAt,
              force || (!automaticRetryStopped && now() >= lastSuccess + interval) else { return nil }
        let ticket = Ticket(id: UUID(), generation: generation)
        flight = ticket; lastAttempt = now()
        return ticket
    }

    func isCurrent(_ ticket: Ticket, scope: String, revision: UUID) -> Bool {
        flight == ticket && ticket.generation == generation && self.scope == scope && self.revision == revision
    }

    func finish(_ ticket: Ticket, succeeded: Bool, error: Error? = nil) {
        guard flight == ticket else { return }
        flight = nil
        guard ticket.generation == generation else { return }
        if succeeded { lastSuccess = now(); retryAt = 0; failures = 0; automaticRetryStopped = false; connectionFailure = false }
        else if let error, !(error is CancellationError) {
            let ns = error as NSError
            connectionFailure = error is URLError || ns.domain == FunctionsErrorDomain
                && [FunctionsErrorCode.unavailable.rawValue, FunctionsErrorCode.deadlineExceeded.rawValue].contains(ns.code)
            failures += 1
            retryAt = now() + min(120, 15 * pow(2, Double(min(failures - 1, 3))))
            if error is AuthFlowError { automaticRetryStopped = true }
            if let backend = error as? BackendCallError, case let .rejected(code, _, reason) = backend {
                let rateLimited = code == FunctionsErrorCode.resourceExhausted.rawValue && reason == "rate_limited"
                automaticRetryStopped = BackendErrorPolicy.isPermanent(FunctionsErrorCode(rawValue: code)) && !rateLimited
                if code == FunctionsErrorCode.resourceExhausted.rawValue { retryAt = max(retryAt, now() + 60) }
            }
            if error as? GifSearchError == .rateLimited { retryAt = max(retryAt, now() + 60) }
        }
    }

    var nextDelay: TimeInterval {
        if flight != nil { return 5 }
        if automaticRetryStopped { return 120 }
        return max(5, max(lastAttempt + 5, max(retryAt, lastSuccess + interval)) - now())
    }

    var isInFlight: Bool { flight != nil }

    func connectionRestored() -> Bool {
        guard connectionFailure, flight == nil else { return false }
        retryAt = 0; connectionFailure = false
        return true
    }
}

/// Successful content mutations wake visible lists; hidden screens do not fetch.
@MainActor @Observable
final class ContentUpdates {
    static let shared = ContentUpdates()
    private(set) var revision = UUID()
    private(set) var activityRevision = UUID()
    func changed() { revision = UUID(); activityRevision = UUID() }
    func activityChanged() { activityRevision = UUID() }
}

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
