import Foundation
import MapKit
import Observation
import FirebaseFunctions

/// Camera values are kept outside Observation; a camera frame never creates a network Task.
struct MapViewport: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let latitudeDelta: Double
    let longitudeDelta: Double

    init(_ region: MKCoordinateRegion) {
        latitude = region.center.latitude
        longitude = (region.center.longitude + 540).truncatingRemainder(dividingBy: 360) - 180
        latitudeDelta = min(180, max(0.000001, region.span.latitudeDelta))
        longitudeDelta = min(360, max(0.000001, region.span.longitudeDelta))
    }

    var region: MKCoordinateRegion {
        .init(center: .init(latitude: latitude, longitude: longitude),
              span: .init(latitudeDelta: latitudeDelta, longitudeDelta: longitudeDelta))
    }
    var width: Double { longitudeDelta * 111_320 * max(0.000001, cos(latitude * .pi / 180)) }
    var boxes: [NoteDensityBounds] { NoteDensityBounds.covering(region) }
    var expanded: Self {
        Self(.init(center: region.center, span: .init(latitudeDelta: latitudeDelta * 1.1, longitudeDelta: longitudeDelta * 1.1)))
    }
    var groupRadius: Double { min(2_000, max(50, hypot(latitudeDelta * 111_320, width) / 2 + 80)) }
}

enum MapSummaryKind: Equatable, Sendable { case heat(Int), groups }

struct MapSummaryRequest: Equatable, Sendable {
    let viewport: MapViewport
    let kind: MapSummaryKind
}

struct MapSummary: Sendable {
    enum Content: Sendable {
        case heat([NoteDensityCell])
        case groups([MapNoteGroup], unlockRadius: Double)
    }
    let request: MapSummaryRequest
    let content: Content
    /// Missing metadata on old servers permits exact-request reuse only.
    let complete: Bool
    let groupCoverageRadius: Double?

    func covers(_ target: MapSummaryRequest) -> Bool {
        guard target.kind == request.kind else { return false }
        if target.viewport == request.viewport || target.viewport.expanded == request.viewport { return true }
        guard complete else { return false }
        switch content {
        case .heat:
            return target.viewport.boxes.allSatisfy { box in
                request.viewport.boxes.contains { outer in
                    outer.minLat <= box.minLat && outer.maxLat >= box.maxLat
                        && outer.minLng <= box.minLng && outer.maxLng >= box.maxLng
                }
            }
        case .groups:
            guard let radius = groupCoverageRadius, radius > 80,
                  target.viewport.longitudeDelta < 180 else { return false }
            let center = CLLocation(latitude: request.viewport.latitude, longitude: request.viewport.longitude)
            return target.viewport.boxes.allSatisfy { box in
                [box.minLat, box.maxLat].allSatisfy { lat in
                    [box.minLng, box.maxLng].allSatisfy { lng in
                        center.distance(from: CLLocation(latitude: lat, longitude: lng)) + 80 <= radius
                    }
                }
            }
        }
    }

    var estimatedBytes: Int {
        switch content {
        case .heat(let cells): cells.count * 96 + 256
        case .groups(let groups, _): groups.reduce(256) { $0 + 160 + $1.id.utf8.count + $1.postIDs.reduce(0) { $0 + $1.utf8.count + 24 } }
        }
    }
}

/// One timer, one running summary fetch and one latest pending viewport. Never stores bodies,
/// author identities or access grants. The network loader always retains server authorization.
@MainActor @Observable
final class MapRequestCoordinator {
    static let shared = MapRequestCoordinator { try await NoteDensityClient.shared.summary(for: $0) }
    struct Presentation {
        let viewport: MapViewport
        let layer: NoteMapLayer
        let summary: MapSummary
    }
    struct Metrics {
        var cameraEvents = 0
        var requests = 0
        var cacheHits = 0
        var discardedResponses = 0
    }
    private(set) var presentation: Presentation?
    private(set) var presentationRevision = 0
    private(set) var accessRevision = 0
    private(set) var isLoading = false
    private(set) var failed = false
    @ObservationIgnored private(set) var metrics = Metrics()
    @ObservationIgnored private var viewer: UUID?
    @ObservationIgnored private var epoch = 0
    @ObservationIgnored private var active = false
    @ObservationIgnored private var latest: (viewport: MapViewport, layer: NoteMapLayer)?
    @ObservationIgnored private var pending = false
    @ObservationIgnored private var deadline: TimeInterval = 0
    @ObservationIgnored private var lastStart: TimeInterval = -.infinity
    @ObservationIgnored private var retryAt: TimeInterval = 0
    @ObservationIgnored private var failures = 0
    @ObservationIgnored private var wakeTask: Task<Void, Never>?
    @ObservationIgnored private var wakeGeneration = 0
    @ObservationIgnored private var fetchTask: Task<Void, Never>?
    @ObservationIgnored private var entries: [(summary: MapSummary, expires: TimeInterval)] = []
    @ObservationIgnored private let now: () -> TimeInterval
    @ObservationIgnored private let automaticScheduling: Bool
    @ObservationIgnored private let retryJitter: () -> TimeInterval
    @ObservationIgnored private let loader: (MapSummaryRequest) async throws -> MapSummary

    init(now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         automaticScheduling: Bool = true,
         retryJitter: @escaping () -> TimeInterval = { Double.random(in: 0...0.25) },
         loader: @escaping (MapSummaryRequest) async throws -> MapSummary) {
        self.now = now; self.automaticScheduling = automaticScheduling; self.retryJitter = retryJitter; self.loader = loader
    }

    func setViewer(_ value: UUID?) {
        guard viewer != value else { return }
        viewer = value
        invalidate()
    }

    func resume() { active = true; if latest != nil { pending = true; scheduleWake() } }
    func suspend() {
        active = false; wakeGeneration += 1; wakeTask?.cancel(); wakeTask = nil
        // Already dispatched calls may still be billed. Let them fill only the current scope.
        isLoading = false
    }

    func invalidate() {
        epoch += 1; entries = []; presentation = nil; presentationRevision += 1; accessRevision += 1
        failed = false; failures = 0; retryAt = 0
        pending = latest != nil
        deadline = now()
        scheduleWake()
    }

    func refresh() {
        guard latest != nil else { return }
        if failures > 3, now() >= retryAt { failures = 0 }
        // Repeated refresh taps share the running call rather than invalidating it repeatedly.
        if fetchTask == nil { entries = [] }
        pending = true; deadline = now(); scheduleWake()
    }

    func cameraChanged(_ region: MKCoordinateRegion, byUser: Bool) {
        let viewport = MapViewport(region)
        guard viewport.latitude.isFinite, viewport.longitude.isFinite,
              viewport.latitudeDelta.isFinite, viewport.longitudeDelta.isFinite else { return }
        metrics.cameraEvents += 1
        let layer = NoteMapLayer.stable(forWidth: viewport.width, previous: latest?.layer)
        if latest?.viewport == viewport, latest?.layer == layer { return }
        latest = (viewport, layer)
        pending = true
        deadline = now() + (byUser ? 1.2 : 0.2)
        if failures > 3, now() >= retryAt { failures = 0 }
        // Only the deadline changes while the one existing timer is sleeping.
        scheduleWake()
    }

    private var target: MapSummaryRequest? {
        guard let latest else { return nil }
        return .init(viewport: latest.viewport, kind: latest.layer.isHeat ? .heat(latest.layer.precision!) : .groups)
    }

    private func scheduleWake() {
        guard automaticScheduling, active, viewer != nil, pending, wakeTask == nil else { return }
        wakeGeneration += 1
        let generation = wakeGeneration
        wakeTask = Task { [weak self] in
            while let self, !Task.isCancelled, self.active, self.pending, self.wakeGeneration == generation {
                let delay = max(0, self.deadline - self.now())
                if delay > 0 {
                    do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                    continue
                }
                self.wakeTask = nil
                self.processPending()
                return
            }
            if self?.wakeGeneration == generation { self?.wakeTask = nil }
        }
    }

    /// Internal synchronous seam for deterministic clock/network tests; no real sleeps needed.
    func processPending() {
        guard active, viewer != nil, pending, now() >= deadline, let target, let latest else { return }
        entries.removeAll { $0.expires <= now() }
        if let index = entries.lastIndex(where: { $0.summary.covers(target) }) {
            // Touch recency, never expiry: frequent visits must not keep stale metadata alive.
            let hit = entries.remove(at: index)
            entries.append(hit)
            metrics.cacheHits += 1
            publish(hit.summary, viewport: latest.viewport, layer: latest.layer)
            pending = false; failed = false; isLoading = false
            return
        }
        guard fetchTask == nil else { return }
        guard failures <= 3 else { pending = false; return }
        let eligible = max(lastStart + 2, retryAt)
        if now() < eligible { deadline = eligible; scheduleWake(); return }
        let request = MapSummaryRequest(viewport: target.viewport.expanded, kind: target.kind)
        let startedEpoch = epoch
        lastStart = now(); metrics.requests += 1; isLoading = true; failed = false
        pending = false
        fetchTask = Task { [weak self, loader] in
            do {
                let result = try await loader(request)
                guard let self else { return }
                self.fetchTask = nil
                guard self.epoch == startedEpoch else {
                    self.metrics.discardedResponses += 1
                    self.isLoading = false; self.scheduleWake(); return
                }
                self.failures = 0; self.retryAt = 0
                if result.estimatedBytes <= 2 * 1_024 * 1_024 {
                    let ttl: TimeInterval = if case .heat(let precision) = request.kind, precision <= 6 { 300 } else { 60 }
                    self.entries.append((result, self.now() + ttl))
                    while self.entries.count > 32 || self.entries.reduce(0, { $0 + $1.summary.estimatedBytes }) > 2 * 1_024 * 1_024 {
                        self.entries.removeFirst()
                    }
                }
                self.isLoading = false
                if self.active, let current = self.target, result.covers(current),
                   let latest = self.latest, self.now() >= self.deadline {
                    self.publish(result, viewport: latest.viewport, layer: latest.layer)
                    self.pending = false
                } else if self.active {
                    self.pending = true
                }
                self.scheduleWake()
            } catch {
                guard let self else { return }
                self.fetchTask = nil; self.isLoading = false
                guard self.epoch == startedEpoch else { self.scheduleWake(); return }
                self.failed = true
                self.failures += 1
                let retryable = Self.canRetry(error)
                if retryable, self.failures <= 3, self.active {
                    self.retryAt = self.now() + [2.0, 5.0, 15.0][self.failures - 1] + max(0, min(0.25, self.retryJitter()))
                    self.deadline = max(self.deadline, self.retryAt); self.pending = true
                } else {
                    self.failures = 4; self.retryAt = self.now() + 60; self.pending = false
                }
                self.scheduleWake()
            }
        }
    }

    func waitForCurrentRequest() async { await fetchTask?.value }

    func trimMemory() { entries.removeAll() }

    private func publish(_ summary: MapSummary, viewport: MapViewport, layer: NoteMapLayer) {
        presentation = .init(viewport: viewport, layer: layer, summary: summary)
        presentationRevision += 1
    }

    private static func canRetry(_ error: Error) -> Bool {
        if error is CancellationError || error is AuthFlowError { return false }
        if let condition = error as? BackendTransientError {
            switch condition { case .busy: return true; case .servicePaused: return false }
        }
        if case let BackendCallError.rejected(code, _, _) = error {
            // resource-exhausted includes oversized scans and a full 60 s rate window.
            // Repeating that scan at 2/5/15 s cannot fix it and multiplies billed reads.
            return [4, 10, 13, 14].contains(code)
        }
        if error is BackendCallError { return false }
        let ns = error as NSError
        if ns.domain == FunctionsErrorDomain {
            guard let code = FunctionsErrorCode(rawValue: ns.code) else { return false }
            return [FunctionsErrorCode.aborted, .internal, .unavailable, .deadlineExceeded].contains(code)
        }
        if let network = error as? URLError {
            return [.timedOut, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost,
                    .dnsLookupFailed, .notConnectedToInternet].contains(network.code)
        }
        return false
    }
}
