import MapKit
import XCTest
@testable import LociAR

@MainActor
final class MapRequestCoordinatorTests: XCTestCase {
    private final class Clock { var time = 100.0 }
    private func region(_ lat: Double = 41, _ lng: Double = 29, span: Double = 0.1) -> MKCoordinateRegion {
        .init(center: .init(latitude: lat, longitude: lng), span: .init(latitudeDelta: span, longitudeDelta: span))
    }
    private func response(_ request: MapSummaryRequest, complete: Bool = true, cells: [NoteDensityCell] = []) -> MapSummary {
        .init(request: request, content: .heat(cells), complete: complete, groupCoverageRadius: nil)
    }
    private func ready(_ coordinator: MapRequestCoordinator, clock: Clock) {
        coordinator.setViewer(UUID()); coordinator.resume()
        clock.time += 2
    }

    func testTwentyRapidMovementsDispatchOnlyTheLastViewportAfterQuietPeriod() async {
        let clock = Clock()
        var requests: [MapSummaryRequest] = []
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
            requests.append(request); return self.response(request)
        }
        ready(coordinator, clock: clock)
        for index in 0..<20 {
            coordinator.cameraChanged(region(41, 29 + Double(index) * 0.01), byUser: true)
            clock.time += 0.05; coordinator.processPending()
        }
        XCTAssertTrue(requests.isEmpty)
        clock.time += 1.21
        coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.viewport.longitude ?? 0, 29.19, accuracy: 0.000001)
        XCTAssertEqual(coordinator.presentation?.viewport.longitude ?? 0, 29.19, accuracy: 0.000001)
    }

    func testTwentySeparatePansInsideFreshCoverageSendNoFurtherRequestsIncludingEmptyResults() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
            calls += 1; return self.response(request)
        }
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 1.3; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        for index in 0..<20 {
            coordinator.cameraChanged(region(41, 29 + Double((index + 1) % 2) * 0.001), byUser: true)
            clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        }
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(coordinator.metrics.cacheHits, 20)
    }

    @MainActor private final class Network {
        var requests: [MapSummaryRequest] = []
        var replies: [CheckedContinuation<MapSummary, any Error>] = []
        var observers: [(Int, CheckedContinuation<Void, Never>)] = []
        func fetch(_ request: MapSummaryRequest) async throws -> MapSummary {
            requests.append(request)
            return try await withCheckedThrowingContinuation { continuation in
                replies.append(continuation)
                let ready = observers.filter { requests.count >= $0.0 }
                observers.removeAll { requests.count >= $0.0 }
                ready.forEach { $0.1.resume() }
            }
        }
        func waitForRequests(_ count: Int) async {
            if requests.count >= count { return }
            await withCheckedContinuation { observers.append((count, $0)) }
        }
        func finish(_ index: Int) {
            replies[index].resume(returning: .init(request: requests[index], content: .heat([]), complete: true, groupCoverageRadius: nil))
        }
    }

    func testAtoBtoAJoinsRunningAAndDoesNotDispatchObsoleteB() async {
        let clock = Clock(), network = Network()
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false, loader: network.fetch)
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 1.3; coordinator.processPending(); await network.waitForRequests(1)
        coordinator.cameraChanged(region(42), byUser: true)
        clock.time += 2; coordinator.processPending()
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 2; coordinator.processPending()
        XCTAssertEqual(network.requests.count, 1)
        network.finish(0); await coordinator.waitForCurrentRequest()
        coordinator.processPending()
        XCTAssertEqual(network.requests.count, 1)
        XCTAssertEqual(coordinator.presentation?.viewport.latitude, 41)
    }

    func testOldAreaResponseCannotReplaceLatestViewport() async {
        let clock = Clock(), network = Network()
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false, loader: network.fetch)
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 1.3; coordinator.processPending(); await network.waitForRequests(1)
        coordinator.cameraChanged(region(42), byUser: true)
        clock.time += 2; network.finish(0); await coordinator.waitForCurrentRequest()
        XCTAssertNil(coordinator.presentation)
        coordinator.processPending(); await network.waitForRequests(2)
        network.finish(1); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(coordinator.presentation?.viewport.latitude, 42)
    }

    func testInvalidationRejectsPendingOldVisibilityResponse() async {
        let clock = Clock(), network = Network()
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false, loader: network.fetch)
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 1.3; coordinator.processPending(); await network.waitForRequests(1)
        coordinator.invalidate()
        network.finish(0); await coordinator.waitForCurrentRequest()
        XCTAssertNil(coordinator.presentation)
        XCTAssertEqual(coordinator.metrics.discardedResponses, 1)
    }

    func testHiddenMapDoesNotDispatchAndSignOutDropsPersonalData() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
            calls += 1; return self.response(request)
        }
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        coordinator.suspend(); clock.time += 10; coordinator.processPending()
        XCTAssertEqual(calls, 0)
        coordinator.resume(); coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 1)
        coordinator.setViewer(nil)
        XCTAssertNil(coordinator.presentation)
        coordinator.processPending()
        XCTAssertEqual(calls, 1)
    }

    func testHeatExpiryDoesNotPollButNextMovementFetchesAgain() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
            calls += 1; return self.response(request)
        }
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        clock.time += 301; coordinator.processPending()
        XCTAssertEqual(calls, 1)
        coordinator.cameraChanged(region(41, 29.001), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 2)
    }

    func testTruncatedResponseOnlyReusesItsExactRequestNotNeighboringCoverage() {
        let a = MapViewport(region())
        let result = response(.init(viewport: a.expanded, kind: .heat(6)), complete: false)
        XCTAssertTrue(result.covers(.init(viewport: a, kind: .heat(6))))
        XCTAssertFalse(result.covers(.init(viewport: MapViewport(region(41, 29.001)), kind: .heat(6))))
        XCTAssertFalse(result.covers(.init(viewport: a, kind: .heat(7))))
    }

    func testDateLineContainmentDoesNotGrantCoverageToGreenwich() {
        let a = MapViewport(region(10, 179.99, span: 0.1))
        let result = response(.init(viewport: a.expanded, kind: .heat(6)))
        XCTAssertTrue(result.covers(.init(viewport: MapViewport(region(10, -179.999, span: 0.01)), kind: .heat(6))))
        XCTAssertFalse(result.covers(.init(viewport: MapViewport(region(10, 0, span: 0.01)), kind: .heat(6))))
    }

    func testClippedGroupRadiusNeverClaimsLargerViewportIsComplete() {
        let a = MapViewport(region(41, 29, span: 1))
        let result = MapSummary(request: .init(viewport: a, kind: .groups), content: .groups([], unlockRadius: 15), complete: true, groupCoverageRadius: 2_000)
        XCTAssertFalse(result.covers(.init(viewport: MapViewport(region(41, 29.001, span: 0.9)), kind: .groups)))
    }

    func testZoomHysteresisAvoidsCallsAcrossSmallThresholdOscillations() {
        for width in [900.0, 1_000, 1_050, 1_119] { XCTAssertEqual(NoteMapLayer.stable(forWidth: width, previous: .counts), .counts) }
        XCTAssertEqual(NoteMapLayer.stable(forWidth: 1_121, previous: .counts), .heat(precision: 7))
        XCTAssertEqual(NoteMapLayer.stable(forWidth: 881, previous: .heat(precision: 7)), .heat(precision: 7))
        XCTAssertEqual(NoteMapLayer.stable(forWidth: 879, previous: .heat(precision: 7)), .counts)
    }

    func testFailedSourceCannotBeRetriedIndefinitelyByPanning() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false, retryJitter: { 0 }) { _ in
            calls += 1; throw URLError(.notConnectedToInternet)
        }
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        for delay in [2.0, 2, 5, 15] {
            clock.time += delay; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        }
        XCTAssertEqual(calls, 4, "initial attempt plus three automatic retries")
        for index in 0..<20 {
            coordinator.cameraChanged(region(41, 29 + Double(index) * 0.01), byUser: true)
            clock.time += 1.3; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        }
        XCTAssertEqual(calls, 4, "changing the area cannot reset the shared circuit breaker")
        clock.time += 60; coordinator.processPending()
        XCTAssertEqual(calls, 4, "expiry alone never polls")
        coordinator.refresh(); coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 5)
    }

    func testPermissionFailureDoesNotAutomaticallyRetry() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { _ in
            calls += 1; throw BackendCallError.rejected(code: 7, message: "Unavailable", reason: nil)
        }
        ready(coordinator, clock: clock)
        coordinator.cameraChanged(region(), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        clock.time += 20; coordinator.processPending()
        XCTAssertEqual(calls, 1)
        XCTAssertTrue(coordinator.failed)
    }

    func testQuotaAndDenseAreaFailuresDoNotRepeatExpensiveScans() async {
        for reason in [nil, "rate_limited", "search_area_too_dense", "map_group_too_large"] as [String?] {
            let clock = Clock()
            var calls = 0
            let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { _ in
                calls += 1; throw BackendCallError.rejected(code: 8, message: "Unavailable", reason: reason)
            }
            ready(coordinator, clock: clock)
            coordinator.cameraChanged(region(), byUser: true)
            for delay in [2.0, 2, 5, 15] {
                clock.time += delay; coordinator.processPending(); await coordinator.waitForCurrentRequest()
            }
            XCTAssertEqual(calls, 1, "quota or oversized-area responses need a changed condition, not repeated scans")
        }
    }

    func testKnownBusyFailureRetriesButPausedServiceDoesNot() async {
        for busy in [true, false] {
            let clock = Clock()
            var calls = 0
            let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
                calls += 1
                if calls == 1 { throw busy ? BackendTransientError.busy : BackendTransientError.servicePaused }
                return self.response(request)
            }
            ready(coordinator, clock: clock)
            coordinator.cameraChanged(region(), byUser: true)
            clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
            clock.time += 3; coordinator.processPending(); await coordinator.waitForCurrentRequest()
            XCTAssertEqual(calls, busy ? 2 : 1)
        }
    }

    func testFrequentlyUsedCoverageSurvivesCacheCapacityEvictionWithoutExtendingTTL() async {
        let clock = Clock()
        var calls = 0
        let coordinator = MapRequestCoordinator(now: { clock.time }, automaticScheduling: false) { request in
            calls += 1; return self.response(request)
        }
        ready(coordinator, clock: clock)
        for index in 0..<32 {
            coordinator.cameraChanged(region(41, 20 + Double(index) * 0.2), byUser: true)
            clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        }
        coordinator.cameraChanged(region(41, 20), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 32)
        coordinator.cameraChanged(region(41, 40), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        coordinator.cameraChanged(region(41, 20), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 33, "a recently used area must not be evicted merely because it was fetched first")
        clock.time += 301
        coordinator.cameraChanged(region(41, 20.001), byUser: true)
        clock.time += 2; coordinator.processPending(); await coordinator.waitForCurrentRequest()
        XCTAssertEqual(calls, 34, "cache hits do not make a stale summary fresh again")
    }
}
