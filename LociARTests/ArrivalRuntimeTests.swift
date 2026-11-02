import CoreLocation
import AVFoundation
import UIKit
import XCTest
@testable import LociAR

private final class ForegroundLocationManagerStub: CLLocationManager {
    override var authorizationStatus: CLAuthorizationStatus { .authorizedWhenInUse }
    override func startUpdatingLocation() {}
    override func stopUpdatingLocation() {}
    override func startUpdatingHeading() {}
    override func stopUpdatingHeading() {}
}

private final class ForegroundHeadingStub: CLHeading {
    override var headingAccuracy: CLLocationDirection { 5 }
    override var description: String { "ForegroundHeadingStub" }
}

final class ArrivalRuntimeTests: XCTestCase {
    @MainActor
    func testPhysicalCameraFramesResumeAcrossNewPinSessions() async throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek AR kamera kareleri fiziksel iPhone gerektirir.")
#else
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            throw XCTSkip("Fiziksel kamera kabulü için kamera izni önceden verilmiş olmalı.")
        }
        let engine = ARPinningEngine()
        let host = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        engine.registerARViewHost(host)
        let view = try XCTUnwrap(engine.existingARView)
        defer { engine.stopSession(); engine.unregisterARViewHost(host) }
        for cycle in 1...3 {
            let ready = await engine.prepareNewPinSession()
            XCTAssertTrue(ready, "Camera did not deliver a frame in pin session \(cycle)")
            guard ready else { return }
            XCTAssertTrue(engine.hasRecentCameraFrame)
            XCTAssertNotNil(engine.currentCameraTransform)
            XCTAssertTrue(engine.existingARView === view)
            engine.stopSession()
            XCTAssertFalse(engine.hasRecentCameraFrame)
            XCTAssertEqual(engine.state, .idle)
        }
#endif
    }

    @MainActor
    func testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements() async throws {
#if targetEnvironment(simulator)
        throw XCTSkip("Gerçek Core Location akışı fiziksel iPhone gerektirir.")
#else
        let controller = LocationController()
        guard controller.authorizationStatus == .authorizedWhenInUse || controller.authorizationStatus == .authorizedAlways else {
            throw XCTSkip("Önce fiziksel konum notu UI testinde konum iznini verin.")
        }
        defer { controller.stop() }
        func awaitFix(after startedAt: Date) async throws -> CLLocation {
            let deadline = Date().addingTimeInterval(45)
            while Date() < deadline {
                if let fix = controller.freshLocation(), fix.timestamp >= startedAt,
                   fix.horizontalAccuracy <= LocationNotePolicy.maxEntryAccuracy {
                    return fix
                }
                try await Task.sleep(for: .milliseconds(250))
            }
            throw NSError(domain: "PhysicalGPSAcceptance", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "45 saniyede yeni ve en fazla 35 m belirsizliğinde gerçek GPS ölçümü alınamadı."
            ])
        }
        let startedAt = Date()
        controller.start()
        let first = try await awaitFix(after: startedAt)
        XCTAssertFalse(first.sourceInformation?.isSimulatedBySoftware == true)
        let firstProof = XCTAttachment(string: "accuracy=\(first.horizontalAccuracy)m age=\(Date().timeIntervalSince(first.timestamp))s simulated=false")
        firstProof.name = "physical-gps-first-fresh-fix"
        firstProof.lifetime = .keepAlways
        add(firstProof)

        controller.stop()
        try await Task.sleep(for: .seconds(2))
        XCTAssertNil(controller.freshLocation())
        XCTAssertTrue(controller.recentLocations.isEmpty)
        let restartedAt = Date()
        controller.start()
        let second = try await awaitFix(after: restartedAt)
        XCTAssertGreaterThan(second.timestamp, first.timestamp)
        XCTAssertFalse(second.sourceInformation?.isSimulatedBySoftware == true)
        let secondProof = XCTAttachment(string: "accuracy=\(second.horizontalAccuracy)m age=\(Date().timeIntervalSince(second.timestamp))s simulated=false")
        secondProof.name = "physical-gps-restarted-fresh-fix"
        secondProof.lifetime = .keepAlways
        add(secondProof)
#endif
    }

    func testRegionMonitoringRetriesAreBoundedAndOnlyAcknowledgedSuccessClearsFailures() {
        var health = ArrivalMonitoringHealth()
        XCTAssertEqual(health.failed("a"), 1)
        XCTAssertEqual(health.failed("a"), 5)
        XCTAssertEqual(health.failed("a"), 15)
        XCTAssertNil(health.failed("a"))
        XCTAssertTrue(health.needsRecovery)
        _ = health.failed("b")
        health.registered("a")
        XCTAssertTrue(health.needsRecovery, "another failed area cannot become ready")
        health.discard("b")
        XCTAssertFalse(health.needsRecovery)
        XCTAssertEqual(health.failed("a"), 1, "a newly failing registered area gets a new bounded budget")
    }

    func testUnsupportedAndInvalidMonitoringRadiiAreRefusedWithoutClippingTheCampaignArea() {
        XCTAssertTrue(ArrivalMonitoringHealth.canMonitor(radius: 300, maximum: 1000))
        XCTAssertFalse(ArrivalMonitoringHealth.canMonitor(radius: 3000, maximum: 1000))
        for invalid in [0.0, -1, Double.infinity, Double.nan] {
            XCTAssertFalse(ArrivalMonitoringHealth.canMonitor(radius: 300, maximum: invalid))
            XCTAssertFalse(ArrivalMonitoringHealth.canMonitor(radius: invalid, maximum: 1000))
        }
    }

    func testOldCircleAndTransitionCallbacksCannotClearANewRegistrationFailure() {
        let center = CLLocationCoordinate2D(latitude: 41, longitude: 29)
        let a = CLCircularRegion(center: center, radius: 300, identifier: "area")
        let changed = CLCircularRegion(center: center, radius: 400, identifier: "area")
        let flags = CLCircularRegion(center: center, radius: 300, identifier: "area")
        flags.notifyOnEntry = false
        XCTAssertTrue(ArrivalMonitoringHealth.matches(a, a))
        XCTAssertFalse(ArrivalMonitoringHealth.matches(a, changed))
        XCTAssertFalse(ArrivalMonitoringHealth.matches(a, flags))
    }

    @MainActor
    func testForegroundSearchDropsAStaleRetainedFixAndStopClearsMeasurementSeeds() {
        let manager = ForegroundLocationManagerStub(), now = Date()
        let controller = LocationController(locationManager: manager)
        controller.start()
        let fix = CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0,
                             horizontalAccuracy: 8, verticalAccuracy: -1, timestamp: now)
        controller.locationManager(manager, didUpdateLocations: [fix])
        XCTAssertEqual(controller.freshLocation(at: now), fix)
        XCTAssertNil(controller.freshLocation(at: now.addingTimeInterval(11)), "a resumed map must await a new area fix")
        controller.stop()
        XCTAssertNil(controller.location)
        XCTAssertTrue(controller.recentLocations.isEmpty)
        XCTAssertNil(controller.freshLocation(at: now))
    }

    @MainActor
    func testForegroundSearchRejectsAFreshButUnusableAreaEstimate() {
        let manager = ForegroundLocationManagerStub(), now = Date()
        let controller = LocationController(locationManager: manager)
        controller.start()
        controller.locationManager(manager, didUpdateLocations: [CLLocation(coordinate: .init(latitude: 41, longitude: 29),
            altitude: 0, horizontalAccuracy: .infinity, verticalAccuracy: -1, timestamp: now)])
        XCTAssertNil(controller.freshLocation(at: now))
    }

    @MainActor
    func testTransientLocationAcquisitionDoesNotAbortForegroundWarmup() {
        let manager = ForegroundLocationManagerStub()
        let controller = LocationController(locationManager: manager)
        controller.start()
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain,
            code: CLError.Code.locationUnknown.rawValue))
        XCTAssertNil(controller.errorMessage, "Map/AR keep waiting within their bounded acquisition window")
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain,
            code: CLError.Code.denied.rawValue))
        XCTAssertNotNil(controller.errorMessage, "a denied permission remains actionable")
    }

    @MainActor
    func testStoppedForegroundStreamIgnoresLateCallbacksAndRestartsWithFreshState() {
        let manager = ForegroundLocationManagerStub(), now = Date()
        let controller = LocationController(locationManager: manager)
        let fix = CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0,
                             horizontalAccuracy: 8, verticalAccuracy: -1, timestamp: now)
        controller.start()
        controller.locationManager(manager, didUpdateLocations: [fix])
        controller.locationManager(manager, didUpdateHeading: ForegroundHeadingStub())
        XCTAssertNotNil(controller.heading)
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain, code: CLError.Code.network.rawValue))
        let previousError = controller.errorMessage
        XCTAssertNotNil(previousError)
        controller.stop()
        controller.locationManager(manager, didUpdateLocations: [fix])
        controller.locationManager(manager, didUpdateHeading: ForegroundHeadingStub())
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain, code: CLError.Code.denied.rawValue))
        XCTAssertNil(controller.location)
        XCTAssertTrue(controller.recentLocations.isEmpty)
        XCTAssertNil(controller.heading)
        XCTAssertEqual(controller.errorMessage, previousError, "a stopped stream cannot replace the last error")
        controller.start()
        XCTAssertNil(controller.errorMessage, "a new acquisition must not abort on an old error")
        controller.locationManager(manager, didUpdateLocations: [fix])
        XCTAssertEqual(controller.freshLocation(at: now), fix)
        XCTAssertEqual(controller.recentLocations.count, 1)
        controller.stop()
    }

    func testAlwaysUpgradeWaitsForTheExplicitOptInAndAnActiveApp() {
        var permission = ArrivalPermissionUpgrade()
        XCTAssertFalse(permission.shouldRequestAlways(status: .authorizedWhenInUse, foreground: true, monitoring: true), "cached consent cannot open a system prompt")
        permission.userRequested()
        XCTAssertFalse(permission.shouldRequestAlways(status: .notDetermined, foreground: true, monitoring: true))
        XCTAssertFalse(permission.shouldRequestAlways(status: .authorizedWhenInUse, foreground: false, monitoring: true), "wait until the first permission alert is dismissed")
        XCTAssertTrue(permission.shouldRequestAlways(status: .authorizedWhenInUse, foreground: true, monitoring: true))
        XCTAssertFalse(permission.shouldRequestAlways(status: .authorizedWhenInUse, foreground: true, monitoring: true), "one upgrade request, including a declined request")
        permission.userRequested()
        XCTAssertFalse(permission.shouldRequestAlways(status: .denied, foreground: true, monitoring: true))
        XCTAssertFalse(permission.pending)
        permission.userRequested()
        XCTAssertFalse(permission.shouldRequestAlways(status: .authorizedWhenInUse, foreground: true, monitoring: false), "social notifications do not request location")
    }
    func testPermissionUpgradeAndForegroundTransitionKeepThePreciseStreamAlive() {
        func plan(always: Bool, foreground: Bool, targets: Bool = true, precise: Bool = true) -> ArrivalLocationPlan {
            .resolve(monitoring: true, foreground: foreground, always: always, whenInUse: !always,
                     fullAccuracy: precise, hasPreciseTargets: targets)
        }
        let initial = plan(always: false, foreground: true)
        XCTAssertEqual(initial.mode, .precise)
        XCTAssertFalse(initial.allowsBackgroundUpdates)
        XCTAssertFalse(initial.pausesAutomatically)
        let upgraded = plan(always: true, foreground: true)
        XCTAssertTrue(upgraded.allowsBackgroundUpdates, "permission upgrade within an existing window")
        XCTAssertEqual(plan(always: true, foreground: false), upgraded, "locking the screen cannot pause the confirmation stream")
        XCTAssertEqual(plan(always: true, foreground: false, targets: false).mode, .stopped)
        XCTAssertTrue(plan(always: true, foreground: false, targets: false).pausesAutomatically)
        XCTAssertFalse(plan(always: true, foreground: false, precise: false).allowsBackgroundUpdates)
        XCTAssertEqual(plan(always: false, foreground: false).mode, .stopped)
    }

    private func note() -> CampaignRegion {
        CampaignRegion(id: UUID(), lat: 41, lng: 29, radius: 300, expiresAt: Date().addingTimeInterval(60).timeIntervalSince1970 * 1000,
                       transition: "entry", kind: "place_note", triggerRadius: 20, notes: [.init(lat: 41, lng: 29, r: 20)])
    }

    func testCachedRegionsReinstallWithoutAnOnlineResponse() {
        let account = UUID(), item = note()
        let plan = ArrivalRegionRegistrationPlan.make(account: account, selected: [item], monitored: [])
        XCTAssertEqual(plan.start.count, 1)
        XCTAssertEqual(plan.start[0].identifier, "lociar.arrival.\(account.uuidString.lowercased()).\(item.id.uuidString.lowercased())")
        XCTAssertTrue(plan.start[0].notifyOnEntry)
        XCTAssertTrue(plan.start[0].notifyOnExit)
        XCTAssertTrue(plan.stop.isEmpty)
    }

    func testExistingRegionRequestsStateAndAChangedCircleIsReplaced() {
        let account = UUID(), item = note()
        let old = ArrivalRegionRegistrationPlan.make(account: account, selected: [item], monitored: []).start[0]
        let unchanged = ArrivalRegionRegistrationPlan.make(account: account, selected: [item], monitored: [old])
        XCTAssertTrue(unchanged.start.isEmpty)
        XCTAssertTrue(unchanged.stop.isEmpty)
        XCTAssertEqual(unchanged.requestState.map(\.identifier), [old.identifier], "already inside on a cold launch")
        let moved = CampaignRegion(id: item.id, lat: item.lat + 0.001, lng: item.lng, radius: item.radius, expiresAt: item.expiresAt,
            transition: item.transition, kind: item.kind, triggerRadius: item.triggerRadius, notes: item.notes)
        let replacement = ArrivalRegionRegistrationPlan.make(account: account, selected: [moved], monitored: [old])
        XCTAssertEqual(replacement.stop.map(\.identifier), [old.identifier])
        XCTAssertEqual(replacement.start[0].center.latitude, moved.lat)
    }

    func testAccountSwitchDropsOldArrivalRegionsAndPreservesReservedRegions() {
        let account = UUID(), other = UUID(), item = note()
        let old = ArrivalRegionRegistrationPlan.make(account: other, selected: [item], monitored: []).start[0]
        let boundary = CLCircularRegion(center: .init(latitude: 41, longitude: 29), radius: 1000, identifier: "lociar.boundary.\(account)")
        let plan = ArrivalRegionRegistrationPlan.make(account: account, selected: [item], monitored: [old, boundary])
        XCTAssertEqual(plan.stop.map(\.identifier), [old.identifier])
        XCTAssertEqual(plan.start.count, 1)
        XCTAssertFalse(plan.stop.contains { $0.identifier == boundary.identifier })
    }

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func fix(age: Double, accuracy: Double = 8) -> CLLocation {
        CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0,
                   horizontalAccuracy: accuracy, verticalAccuracy: -1, timestamp: now.addingTimeInterval(-age))
    }

    func testWakeCannotSearchAroundAnOldButOtherwiseUsableCachedFix() {
        let cached = fix(age: 60)
        XCTAssertNotNil(ArrivalFixSelection.latest([cached], at: now, maxAge: 240, maxAccuracy: 1000))
        XCTAssertNil(ArrivalFixSelection.latest([cached], at: now, maxAge: 240, maxAccuracy: 1000, notBefore: now.addingTimeInterval(-1)))
        let fresh = fix(age: 0.5)
        XCTAssertEqual(ArrivalFixSelection.latest([cached, fresh], at: now, maxAge: 240, maxAccuracy: 1000,
                                                notBefore: now.addingTimeInterval(-1)), fresh)
    }

    func testBatchSelectionRejectsInvalidFutureAndStaleTailSamples() {
        let freshest = fix(age: 1)
        let locations = [fix(age: 3), freshest, fix(age: -20), fix(age: 0, accuracy: -1), fix(age: 500)]
        XCTAssertEqual(ArrivalFixSelection.latest(locations, at: now, maxAge: 10), freshest)
        XCTAssertNil(ArrivalFixSelection.latest([fix(age: 0, accuracy: 1200)], at: now, maxAge: 240, maxAccuracy: 1000))
    }
}

@MainActor
private final class ArrivalTestGate {
    private var blocked: CheckedContinuation<Void, Never>?
    private var observers: [CheckedContinuation<Void, Never>] = []
    func pause() async {
        await withCheckedContinuation { continuation in
            blocked = continuation
            observers.forEach { $0.resume() }; observers.removeAll()
        }
    }
    func waitUntilPaused() async {
        if blocked != nil { return }
        await withCheckedContinuation { observers.append($0) }
    }
    func release() { blocked?.resume(); blocked = nil }
}

final class ArrivalRefreshConcurrencyTests: XCTestCase {
    @MainActor
    func testMovementDuringAnInFlightRefreshPublishesOnlyTheLatestArea() async {
        let coordinator = ArrivalRegionRefreshCoordinator(), gate = ArrivalTestGate()
        var area = "old", published: [String] = [], calls = 0
        let first = Task { @MainActor in
            await coordinator.refresh {
                calls += 1
                let snapshot = area, revision = coordinator.revision
                if calls == 1 { await gate.pause() }
                if revision == coordinator.revision { published.append(snapshot) }
                return true
            }
        }
        await gate.waitUntilPaused()
        area = "new"
        let second = Task { @MainActor in await coordinator.refresh { XCTFail("must join the existing flight"); return false } }
        while coordinator.revision < 2 { await Task.yield() }
        gate.release()
        let a = await first.value, b = await second.value
        XCTAssertTrue(a); XCTAssertTrue(b)
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(published, ["new"])
    }

    @MainActor
    func testCancelledOldFlightCannotClearTheNewAccountFlight() async {
        let coordinator = ArrivalRegionRefreshCoordinator(), oldGate = ArrivalTestGate(), newGate = ArrivalTestGate()
        let old = Task { @MainActor in await coordinator.refresh { await oldGate.pause(); return true } }
        await oldGate.waitUntilPaused()
        coordinator.cancel()
        var calls = 0
        let current = Task { @MainActor in await coordinator.refresh {
            calls += 1
            if calls == 1 { await newGate.pause() }
            return true
        } }
        await newGate.waitUntilPaused()
        oldGate.release()
        let oldResult = await old.value
        XCTAssertFalse(oldResult)
        let revision = coordinator.revision
        let joined = Task { @MainActor in await coordinator.refresh { XCTFail("old completion cleared the new flight"); return false } }
        while coordinator.revision == revision { await Task.yield() }
        newGate.release()
        let a = await current.value, b = await joined.value
        XCTAssertTrue(a); XCTAssertTrue(b); XCTAssertEqual(calls, 2)
    }

    func testStationaryRegionPreferenceTicksReuseOneDiscoveryForFiveMinutes() {
        var policy = ArrivalRegionQueryPolicy(), calls = 0
        let fix = CLLocation(latitude: 41, longitude: 29)
        for minute in 0..<60 {
            let time = Double(minute * 60)
            if policy.needsRefresh(scope: "user|notes", fix: fix, now: time) {
                calls += 1; policy.record(scope: "user|notes", fix: fix, now: time)
            }
        }
        XCTAssertEqual(calls, 12, "60 identical minute ticks need 12 discovery batches, not 60")
    }

    func testRegionDiscoveryRefreshesForMovementNewFixScopeAndExpiryWithoutExtendingTheOldDeadline() {
        var policy = ArrivalRegionQueryPolicy()
        let here = CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())
        let nearby = CLLocation(coordinate: .init(latitude: 41.0001, longitude: 29), altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())
        let moved = CLLocation(coordinate: .init(latitude: 41.003, longitude: 29), altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date())
        XCTAssertTrue(policy.needsRefresh(scope: "user|notes", fix: here, now: 0))
        policy.record(scope: "user|notes", fix: here, now: 0)
        XCTAssertFalse(policy.needsRefresh(scope: "user|notes", fix: nearby, now: 299))
        XCTAssertTrue(policy.needsRefresh(scope: "user|notes", fix: nearby, now: 300))
        XCTAssertTrue(policy.needsRefresh(scope: "user|notes", fix: moved, now: 60))
        XCTAssertTrue(policy.needsRefresh(scope: "other-user|notes", fix: here, now: 60))
        XCTAssertTrue(policy.needsRefresh(scope: "user|promotions", fix: here, now: 60))
        XCTAssertTrue(policy.needsRefresh(scope: "user|notes", fix: here, now: -1))
        policy.record(scope: "user|notes", fix: nil, now: 0)
        XCTAssertTrue(policy.needsRefresh(scope: "user|notes", fix: here, now: 60))
    }

    func testCoarseGPSJitterDoesNotSpendARegionQueryAndFailureDoesNotAdvanceFreshness() {
        var policy = ArrivalRegionQueryPolicy()
        let here = CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0, horizontalAccuracy: 500, verticalAccuracy: 5, timestamp: Date())
        let noisy = CLLocation(coordinate: .init(latitude: 41.003, longitude: 29), altitude: 0, horizontalAccuracy: 500, verticalAccuracy: 5, timestamp: Date())
        policy.record(scope: "same", fix: here, now: 0)
        XCTAssertFalse(policy.needsRefresh(scope: "same", fix: noisy, now: 60))
        XCTAssertTrue(policy.needsRefresh(scope: "same", fix: here, now: 300))
        // An unsuccessful fetch must not call recordSuccess.
        XCTAssertTrue(policy.needsRefresh(scope: "same", fix: here, now: 301))
    }


    @MainActor
    func testSixIdenticalRoutineRefreshesJoinOneNetworkRound() async {
        let coordinator = ArrivalRegionRefreshCoordinator(), gate = ArrivalTestGate()
        var calls = 0
        let first = Task { @MainActor in await coordinator.refresh(invalidating: false) {
            calls += 1; await gate.pause(); return true
        } }
        await gate.waitUntilPaused()
        let revision = coordinator.revision
        var waiting = 0
        let others = (0..<5).map { _ in Task { @MainActor in
            waiting += 1
            return await coordinator.refresh(invalidating: false) { XCTFail("must join the existing request"); return false }
        } }
        while waiting < 5 { await Task.yield() }
        XCTAssertEqual(coordinator.revision, revision)
        gate.release()
        let result = await first.value
        XCTAssertTrue(result)
        for task in others { let joined = await task.value; XCTAssertTrue(joined) }
        XCTAssertEqual(calls, 1)
    }

    @MainActor
    func testForcedPushDuringRoutineRefreshStillRequestsAndPublishesANewRound() async {
        let coordinator = ArrivalRegionRefreshCoordinator(), gate = ArrivalTestGate()
        var calls = 0, published: [Int] = []
        let first = Task { @MainActor in await coordinator.refresh(invalidating: false) {
            calls += 1
            let revision = coordinator.revision
            if calls == 1 { await gate.pause() }
            if revision == coordinator.revision { published.append(calls) }
            return true
        } }
        await gate.waitUntilPaused()
        let revision = coordinator.revision
        let push = Task { @MainActor in await coordinator.refresh { XCTFail("must reuse the queued operation"); return false } }
        while coordinator.revision == revision { await Task.yield() }
        gate.release()
        let a = await first.value, b = await push.value
        XCTAssertTrue(a); XCTAssertTrue(b)
        XCTAssertEqual(calls, 2); XCTAssertEqual(published, [2])
    }


    func testFastRegionFailuresCannotTurnEveryGPSFixIntoARequest() {
        var policy = ArrivalRegionQueryPolicy(), calls = 0
        let fix = CLLocation(latitude: 41, longitude: 29)
        for second in 0..<180 {
            let now = Double(second)
            if policy.needsRefresh(scope: "viewer", fix: fix, now: now), policy.mayAttempt(scope: "viewer", now: now) {
                calls += 1; policy.recordFailure(scope: "viewer", now: now)
            }
        }
        XCTAssertEqual(calls, 4, "180 failed GPS callbacks must not launch 180 query batches")
        XCTAssertTrue(policy.mayAttempt(scope: "new-viewer", now: 179))
    }

    func testFailedForcedRegionReadInvalidatesFreshnessAndSuccessClearsTheCooldown() {
        var policy = ArrivalRegionQueryPolicy()
        let fix = CLLocation(latitude: 41, longitude: 29)
        policy.record(scope: "same", fix: fix, now: 0)
        policy.recordFailure(scope: "same", now: 10)
        XCTAssertTrue(policy.needsRefresh(scope: "same", fix: fix, now: 11))
        XCTAssertFalse(policy.mayAttempt(scope: "same", now: 24))
        XCTAssertTrue(policy.mayAttempt(scope: "same", now: 25))
        policy.record(scope: "same", fix: fix, now: 25)
        XCTAssertTrue(policy.mayAttempt(scope: "same", now: 26))
        XCTAssertFalse(policy.needsRefresh(scope: "same", fix: fix, now: 26))
    }

}
