import CoreLocation
import XCTest
@testable import LociAR

final class ArrivalRuntimeTests: XCTestCase {
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
        let controller = LocationController(), manager = CLLocationManager(), now = Date()
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
        let controller = LocationController(), manager = CLLocationManager(), now = Date()
        controller.locationManager(manager, didUpdateLocations: [CLLocation(coordinate: .init(latitude: 41, longitude: 29),
            altitude: 0, horizontalAccuracy: .infinity, verticalAccuracy: -1, timestamp: now)])
        XCTAssertNil(controller.freshLocation(at: now))
    }

    @MainActor
    func testTransientLocationAcquisitionDoesNotAbortForegroundWarmup() {
        let controller = LocationController(), manager = CLLocationManager()
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain,
            code: CLError.Code.locationUnknown.rawValue))
        XCTAssertNil(controller.errorMessage, "Map/AR keep waiting within their bounded acquisition window")
        controller.locationManager(manager, didFailWithError: NSError(domain: kCLErrorDomain,
            code: CLError.Code.denied.rawValue))
        XCTAssertNotNil(controller.errorMessage, "a denied permission remains actionable")
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
}
