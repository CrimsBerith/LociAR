import CoreLocation
import XCTest
@testable import LociAR

final class LocationNoteTests: XCTestCase {
    func testLocationModeStopsAfterLastBackgroundTargetAndReturnsToLowPowerInForeground() {
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: true, foreground: false, authorized: true, fullAccuracy: true, hasPreciseTargets: true), .precise)
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: true, foreground: false, authorized: true, fullAccuracy: true, hasPreciseTargets: false), .stopped)
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: true, foreground: true, authorized: true, fullAccuracy: true, hasPreciseTargets: false), .lowPower)
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: false, foreground: true, authorized: true, fullAccuracy: true, hasPreciseTargets: true), .stopped)
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: true, foreground: true, authorized: false, fullAccuracy: true, hasPreciseTargets: true), .stopped)
        XCTAssertEqual(ArrivalLocationMode.resolve(monitoring: true, foreground: false, authorized: true, fullAccuracy: false, hasPreciseTargets: true), .stopped)
    }
    func testInterruptedNoteDeliveryRetainsItsIDWithoutStoringContentOrLocation() throws {
        let region = UUID(), now = Date()
        let attempt = PlaceNoteDeliveryAttempt(deliveryID: UUID(), createdAt: now)
        let data = try JSONEncoder().encode([region: attempt])
        let restored = try JSONDecoder().decode([UUID: PlaceNoteDeliveryAttempt].self, from: data)
        XCTAssertEqual(restored[region], attempt)
        XCTAssertNil(restored[region]?.queuedActivityID)
        XCTAssertTrue(attempt.isUsable(at: now.addingTimeInterval(60)))
        XCTAssertFalse(attempt.isUsable(at: now.addingTimeInterval(86_400)))
        XCTAssertFalse(attempt.isUsable(at: now.addingTimeInterval(-11)))
        let json = String(decoding: data, as: UTF8.self)
        for privateField in ["caption", "body", "latitude", "longitude", "location"] { XCTAssertFalse(json.contains(privateField)) }
    }

    func testNoteEntryWaitsTenSecondsOfContinuousFixes() {
        var confirmation = LocationNoteEntryConfirmation()
        let start = Date(timeIntervalSince1970: 1_000)
        for second in [0, 2, 4, 6, 8] {
            XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(Double(second))))
        }
        XCTAssertTrue(confirmation.observe(sampleAt: start.addingTimeInterval(10)))
    }

    func testNoteEntryRestartsAfterLosingTheFixStream() {
        var confirmation = LocationNoteEntryConfirmation()
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertFalse(confirmation.observe(sampleAt: start))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(4)))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(11)))
        XCTAssertEqual(confirmation.startedAt, start.addingTimeInterval(11))
        for second in [13, 15, 17, 19] {
            XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(Double(second))))
        }
        XCTAssertTrue(confirmation.observe(sampleAt: start.addingTimeInterval(21)))
    }

    func testLongCampaignWindowCannotReuseAnExpiredNoteConfirmation() {
        var confirmation = LocationNoteEntryConfirmation()
        let start = Date(timeIntervalSince1970: 1_000)
        for second in stride(from: 0, through: 600, by: 2) { _ = confirmation.observe(sampleAt: start.addingTimeInterval(Double(second))) }
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(602)), "server confirmation limit is 600 seconds even in a 30-minute campaign window")
        XCTAssertEqual(confirmation.startedAt, start.addingTimeInterval(602))
        for second in [604, 606, 608, 610] { XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(Double(second)))) }
        XCTAssertTrue(confirmation.observe(sampleAt: start.addingTimeInterval(612)))
    }

    func testRepeatedOrOlderFixesCannotConfirmNoteEntry() {
        var confirmation = LocationNoteEntryConfirmation()
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertFalse(confirmation.observe(sampleAt: start))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(4)))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(4)))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(2)))
        XCTAssertFalse(confirmation.observe(sampleAt: start.addingTimeInterval(10)))
        XCTAssertEqual(confirmation.startedAt, start.addingTimeInterval(10))
    }

    private let start = Date(timeIntervalSince1970: 1_800_000_000)
    private let metre = 1 / 111_320.0

    private func sample(north: Double, accuracy: Double, at seconds: Double, simulated: Bool = false) -> LocationSample {
        LocationSample(latitude: 41 + north * metre, longitude: 29, accuracy: accuracy,
                       timestamp: start.addingTimeInterval(seconds), simulated: simulated)
    }

    func testEstimatorRejectsCachedStaleSimulatedAndInvalidFixes() {
        var estimator = LocationFixEstimator(startedAt: start)
        XCTAssertFalse(estimator.add(sample(north: 0, accuracy: 5, at: -1), now: start), "cached fix from before the composer opened")
        XCTAssertFalse(estimator.add(sample(north: 0, accuracy: 5, at: 1), now: start.addingTimeInterval(5)), "older than 3 s")
        XCTAssertFalse(estimator.add(sample(north: 0, accuracy: 5, at: 1, simulated: true), now: start.addingTimeInterval(1)))
        XCTAssertFalse(estimator.add(sample(north: 0, accuracy: -1, at: 1), now: start.addingTimeInterval(1)))
        XCTAssertNil(estimator.estimate)
        XCTAssertEqual(estimator.outcome, .noFix)
    }

    func testTypicalOutdoorConvergenceBecomesReadyWithinSeconds() {
        var estimator = LocationFixEstimator(startedAt: start)
        // Wi-Fi first, then GPS converging, as an iPhone reports outdoors.
        let stream: [(Double, Double, Double)] = [(1, 40, 65), (2, 12, 30), (3, 3, 14), (4, 1, 9), (5, 0.5, 7), (6, 0.2, 6)]
        var readyAt: Double?
        for (t, north, accuracy) in stream {
            let now = start.addingTimeInterval(t)
            estimator.add(sample(north: north, accuracy: accuracy, at: t), now: now)
            if readyAt == nil, estimator.isReady(now: now) { readyAt = t }
        }
        XCTAssertEqual(readyAt, 5, "ready once 7 m and three agreeing fixes arrive")
        let estimate = try! XCTUnwrap(estimator.estimate)
        XCTAssertEqual(estimate.accuracy, 6)
        // The weighted mean ignores the early Wi-Fi fixes and lands within a metre of the truth.
        XCTAssertLessThan(estimate.location.distance(from: CLLocation(latitude: 41, longitude: 29)), 1.5)
        guard case .gps = estimator.outcome else { return XCTFail("expected a GPS outcome") }
    }

    func testGPSAverageCrossesTheDateLineWithoutJumpingToGreenwich() throws {
        var estimator = LocationFixEstimator(startedAt: start)
        for (i, longitude) in [179.999999, -179.999999, 179.999998].enumerated() {
            let time = start.addingTimeInterval(Double(i + 1))
            estimator.add(.init(latitude: 40, longitude: longitude, accuracy: 5, timestamp: time), now: time)
        }
        let estimate = try XCTUnwrap(estimator.estimate)
        XCTAssertGreaterThan(abs(estimate.longitude), 179.9999)
        XCTAssertLessThan(estimate.location.distance(from: CLLocation(latitude: 40, longitude: 180)), 1)
        XCTAssertTrue(estimator.isReady(now: start.addingTimeInterval(3)))
    }

    func testExtremeAccuracyCannotOverflowTheGPSAverage() throws {
        var estimator = LocationFixEstimator(startedAt: start)
        estimator.add(.init(latitude: 89.9998, longitude: 179.9, accuracy: 1e250, timestamp: start), now: start)
        let estimate = try XCTUnwrap(estimator.estimate)
        XCTAssertTrue(estimate.latitude.isFinite); XCTAssertTrue(estimate.longitude.isFinite)
        XCTAssertEqual(estimate.accuracy, 1e250)
        guard case .tooUncertain = estimator.outcome else { return XCTFail("unusable precision must never publish") }
    }

    func testUnstableOrWarmupFixesAreNotReady() {
        var estimator = LocationFixEstimator(startedAt: start)
        for t in [0.5, 1.0, 1.5] { estimator.add(sample(north: 0, accuracy: 5, at: t), now: start.addingTimeInterval(t)) }
        XCTAssertFalse(estimator.isReady(now: start.addingTimeInterval(1.5)), "two-second warm-up")
        var jumpy = LocationFixEstimator(startedAt: start)
        for (t, north) in [(3.0, 0.0), (4.0, 12.0), (5.0, 0.0)] { jumpy.add(sample(north: north, accuracy: 8, at: t), now: start.addingTimeInterval(t)) }
        XCTAssertFalse(jumpy.isReady(now: start.addingTimeInterval(5)), "a 12 m jump is not stable")
    }

    func testOutcomeTiersMatchTheServer() {
        func outcome(_ accuracy: Double) -> LocationFixEstimator.Outcome {
            var estimator = LocationFixEstimator(startedAt: start)
            estimator.add(sample(north: 0, accuracy: accuracy, at: 1), now: start.addingTimeInterval(1))
            return estimator.outcome
        }
        guard case .gps = outcome(15) else { return XCTFail("15 m is accepted") }
        guard case .needsManualPin = outcome(16) else { return XCTFail("16 m needs a manual pin") }
        guard case .needsManualPin = outcome(50) else { return XCTFail("50 m needs a manual pin") }
        XCTAssertEqual(outcome(51), .tooUncertain(51))
    }

    func testStoppedStreamLosesReadinessAndCannotPublishAnOldFix() {
        var estimator = LocationFixEstimator(startedAt: start)
        for t in [1.0, 2, 3] { estimator.add(sample(north: 0, accuracy: 5, at: t), now: start.addingTimeInterval(t)) }
        XCTAssertTrue(estimator.isReady(now: start.addingTimeInterval(3)))
        XCTAssertFalse(estimator.isReady(now: start.addingTimeInterval(10)))
        estimator.prune(at: start.addingTimeInterval(10))
        XCTAssertEqual(estimator.outcome, .noFix)
    }

    func testSeedsRejectOldFutureNonfiniteAndDuplicateFixes() {
        var estimator = LocationFixEstimator(startedAt: start)
        let now = start.addingTimeInterval(10)
        let valid = sample(north: 0, accuracy: 5, at: 9)
        estimator.seed([sample(north: 50, accuracy: 2, at: 1), sample(north: 0, accuracy: .infinity, at: 9),
                        sample(north: 0, accuracy: 5, at: 20), valid, valid], now: now)
        XCTAssertEqual(estimator.samples, [valid])
        XCTAssertFalse(estimator.isReady(now: now), "redelivered fixes cannot supply stability")
        XCTAssertEqual(estimator.estimate?.timestamp, valid.timestamp)
    }

    func testWalkingDiscardsAnOlderMoreAccuratePosition() {
        var estimator = LocationFixEstimator(startedAt: start)
        estimator.add(sample(north: 0, accuracy: 2, at: 1), now: start.addingTimeInterval(1))
        estimator.add(sample(north: 50, accuracy: 8, at: 6), now: start.addingTimeInterval(6))
        XCTAssertEqual(estimator.estimate?.accuracy, 8)
        XCTAssertLessThan(estimator.estimate!.location.distance(from: sample(north: 50, accuracy: 8, at: 6).location), 0.1)
    }

    func testDisagreeingAccurateFixesDoNotClaimPointPrecision() {
        var estimator = LocationFixEstimator(startedAt: start)
        estimator.add(sample(north: 0, accuracy: 5, at: 1), now: start.addingTimeInterval(1))
        estimator.add(sample(north: 120, accuracy: 5, at: 2), now: start.addingTimeInterval(2))
        XCTAssertGreaterThan(estimator.estimate!.accuracy, LocationNotePolicy.maxCreateAccuracy)
        guard case .tooUncertain = estimator.outcome else { return XCTFail("GPS disagreement must not publish a precise midpoint") }
    }

    func testARPublishRejectsStaleFutureAndInaccurateFixes() {
        func fix(age: Double, accuracy: Double) -> CLLocation {
            CLLocation(coordinate: .init(latitude: 41, longitude: 29), altitude: 0,
                       horizontalAccuracy: accuracy, verticalAccuracy: -1, timestamp: start.addingTimeInterval(-age))
        }
        XCTAssertTrue(GeoPoseCaptureService.isPublishable(fix(age: 1, accuracy: 8), at: start))
        XCTAssertFalse(GeoPoseCaptureService.isPublishable(fix(age: 60, accuracy: 2), at: start))
        XCTAssertFalse(GeoPoseCaptureService.isPublishable(fix(age: -20, accuracy: 2), at: start))
        XCTAssertFalse(GeoPoseCaptureService.isPublishable(fix(age: 1, accuracy: 101), at: start))
    }

    func testEntryRuleMatchesServerRule() {
        XCTAssertTrue(LocationNotePolicy.fixInsideNote(distance: 25, accuracy: 8, radius: 20))
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 30, accuracy: 5, radius: 20))
        XCTAssertTrue(LocationNotePolicy.fixInsideNote(distance: 39, accuracy: 30, radius: 20), "tolerance capped at 20 m")
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 41, accuracy: 30, radius: 20))
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 0, accuracy: 36, radius: 20), "fixes worse than 35 m never count")
    }
}

final class ArrivalMonitoringPreferenceTests: XCTestCase {
    func testColdLaunchRestoresOnlyAcknowledgedChoicesForTheCurrentAccount() {
        let suite = "lociar.tests.arrival.\(UUID().uuidString)", user = UUID(), other = UUID()
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(true, forKey: "lociar.notifications.regions-enabled.v2.\(user.uuidString)")
        defaults.set(true, forKey: "lociar.place-notes.enabled.\(user.uuidString)")
        defaults.set(true, forKey: "lociar.promotions.enabled.\(user.uuidString)")
        let restored = ArrivalMonitoringPreferences(userID: user, defaults: defaults)
        XCTAssertTrue(restored.enabled); XCTAssertTrue(restored.placeNotes); XCTAssertTrue(restored.promotions)
        XCTAssertFalse(ArrivalMonitoringPreferences(userID: other, defaults: defaults).enabled)
        defaults.set(["notifications": false], forKey: "lociar.data-preferences.pending.\(user.uuidString)")
        let revoked = ArrivalMonitoringPreferences(userID: user, defaults: defaults)
        XCTAssertFalse(revoked.enabled); XCTAssertFalse(revoked.placeNotes); XCTAssertFalse(revoked.promotions)
    }
}

final class LocationNoteRegionTests: XCTestCase {
    private let now = Date()
    private let metre = 1 / 111_320.0

    private func region(notes: [NoteTarget]) -> CampaignRegion {
        CampaignRegion(id: UUID(), lat: 41, lng: 29, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000,
                       transition: "entry", kind: "place_note", triggerRadius: notes.map(\.r).max(), notes: notes)
    }

    private func fix(north: Double, accuracy: Double, speed: Double = -1, age: Double = 0) -> CLLocation {
        CLLocation(coordinate: CLLocationCoordinate2D(latitude: 41 + north * metre, longitude: 29), altitude: 0,
                   horizontalAccuracy: accuracy, verticalAccuracy: -1, course: -1, courseAccuracy: -1,
                   speed: speed, speedAccuracy: speed >= 0 ? 0.5 : -1, timestamp: now.addingTimeInterval(-age))
    }

    func testPlaceNoteRegionsAcceptRealisticPhoneGPS() {
        let note = region(notes: [NoteTarget(lat: 41, lng: 29, r: 20)])
        XCTAssertTrue(note.isUsable(at: now))
        XCTAssertTrue(note.permitsPreciseEntry(fix(north: 25, accuracy: 8), at: now), "8 m fix 25 m away touches a 20 m note")
        XCTAssertFalse(note.permitsPreciseEntry(fix(north: 60, accuracy: 8), at: now))
        XCTAssertFalse(note.permitsPreciseEntry(fix(north: 0, accuracy: 40), at: now), "worse than 35 m")
        XCTAssertFalse(note.permitsPreciseEntry(fix(north: 0, accuracy: 8, age: 12), at: now), "stale")
        XCTAssertFalse(note.permitsPreciseEntry(fix(north: 0, accuracy: 8, speed: 9), at: now), "driving past")
        XCTAssertTrue(note.permitsPreciseEntry(fix(north: 0, accuracy: 8, speed: 1.3), at: now), "walking")
    }

    func testAnyNoteInTheClusterCountsAndDistanceIsToTheNearestCircle() {
        let cluster = region(notes: [NoteTarget(lat: 41, lng: 29, r: 15), NoteTarget(lat: 41 + 20 * metre, lng: 29, r: 30)])
        XCTAssertTrue(cluster.permitsPreciseEntry(fix(north: 55, accuracy: 5), at: now), "inside the second, wider note")
        XCTAssertEqual(cluster.distanceToNearestTarget(fix(north: 100, accuracy: 5)), 50, accuracy: 0.5)
    }

    func testNotesAndCampaignsShareTheGPSTolerantRadiusRange() {
        var note = region(notes: [NoteTarget(lat: 41, lng: 29, r: 20)])
        note.triggerRadius = 2.5
        XCTAssertFalse(note.isUsable(at: now), "notes use 15-100 m")
        let badTarget = region(notes: [NoteTarget(lat: 41, lng: 29, r: 500)])
        XCTAssertFalse(badTarget.isUsable(at: now))
        var campaign = CampaignRegion(id: UUID(), lat: 41, lng: 29, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000)
        campaign.triggerRadius = 30
        XCTAssertTrue(campaign.isUsable(at: now), "campaign arrivals use the same 15-100 m range")
        campaign.triggerRadius = 2.5
        XCTAssertFalse(campaign.isUsable(at: now))
    }

    func testNotesKeepUpToThirteenMonitoredRegions() {
        let campaigns = (0..<18).map { i in CampaignRegion(id: UUID(), lat: 41 + Double(i) / 1000, lng: 29, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000) }
        let notes = (0..<18).map { i in
            CampaignRegion(id: UUID(), lat: 41 + Double(i) / 1000, lng: 29.001, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000,
                           transition: "entry", kind: "place_note", triggerRadius: 20, notes: [NoteTarget(lat: 41 + Double(i) / 1000, lng: 29.001, r: 20)])
        }
        let selected = CampaignRegion.nearest(campaigns + notes, to: CLLocationCoordinate2D(latitude: 41, longitude: 29), at: now)
        XCTAssertEqual(selected.count, 18)
        XCTAssertEqual(selected.filter(\.isPlaceNote).count, 13)
        XCTAssertEqual(CampaignRegion.nearest(campaigns, to: nil, at: now).count, 18, "campaigns use every monitored slot when there are no notes")
    }
}

final class NoteMapLayerTests: XCTestCase {
    func testZoomPicksHeatCountsOrNotes() {
        XCTAssertEqual(NoteMapLayer.forWidth(2_000_000), .heat(precision: 4))
        XCTAssertEqual(NoteMapLayer.forWidth(120_000), .heat(precision: 5))
        XCTAssertEqual(NoteMapLayer.forWidth(20_000), .heat(precision: 6))
        XCTAssertEqual(NoteMapLayer.forWidth(2_000), .heat(precision: 7))
        XCTAssertEqual(NoteMapLayer.forWidth(600), .counts)
        XCTAssertEqual(NoteMapLayer.forWidth(200), .notes)
        XCTAssertNil(NoteMapLayer.notes.precision)
        XCTAssertEqual(NoteMapLayer.counts.precision, 7)
        XCTAssertTrue(NoteMapLayer.heat(precision: 5).isHeat)
        XCTAssertFalse(NoteMapLayer.counts.isHeat)
    }

    func testHeatSpotsMergeNearbyCellsAtTheirNoteWeightedCentre() {
        let cells = [
            NoteDensityCell(cell: "a", lat: 38.030, lng: 27.130, count: 30),
            NoteDensityCell(cell: "b", lat: 38.034, lng: 27.134, count: 10),
            NoteDensityCell(cell: "c", lat: 35.660, lng: 139.700, count: 5),
            NoteDensityCell(cell: "d", lat: 38.031, lng: 27.131, count: 0),
        ]
        // A whole-world view: the two nearby cells become one spot, Tokyo stays separate.
        let blobs = NoteHeatBlob.bin(cells, longitudeSpan: 360)
        XCTAssertEqual(blobs.map(\.count), [40, 5], "busiest first; empty cells are ignored")
        XCTAssertEqual(blobs[0].latitude, (38.030 * 30 + 38.034 * 10) / 40, accuracy: 1e-9)
        XCTAssertEqual(blobs[0].longitude, (27.130 * 30 + 27.134 * 10) / 40, accuracy: 1e-9)
        // Street-sized bins keep the two cells apart.
        XCTAssertEqual(NoteHeatBlob.bin(cells, longitudeSpan: 0.004).filter { $0.count >= 10 }.count, 2)
    }

    func testHeatSpotsStayPutOnSmallZoomChangesAndAreCapped() {
        let cells = (0..<50).map { NoteDensityCell(cell: "c\($0)", lat: -40 + Double($0), lng: -120 + 4 * Double($0), count: 1 + $0) }
        XCTAssertEqual(NoteHeatBlob.bin(cells, longitudeSpan: 360), NoteHeatBlob.bin(cells, longitudeSpan: 300),
                       "the grid snaps to zoom levels, so a small zoom or a pan keeps every spot in place")
        let capped = NoteHeatBlob.bin(cells, longitudeSpan: 360, columns: 9, limit: 3)
        XCTAssertEqual(capped.count, 3)
        XCTAssertEqual(capped.map(\.count), capped.map(\.count).sorted(by: >))
    }

    func testGlassDensityPaletteRunsFromMintThroughAquaToAmber() {
        let low = NoteHeatPalette.rgb(0), mid = NoteHeatPalette.rgb(0.55), high = NoteHeatPalette.rgb(1)
        XCTAssertEqual(low.red, 0.22, accuracy: 1e-9)
        XCTAssertEqual(low.green, 0.88, accuracy: 1e-9)
        XCTAssertGreaterThan(mid.blue, mid.green)
        XCTAssertGreaterThan(high.red, high.blue)
        XCTAssertLessThan(high.blue, mid.blue)
        XCTAssertEqual(NoteHeatPalette.rgb(-1).green, low.green, accuracy: 1e-9)
        XCTAssertEqual(NoteHeatPalette.rgb(2).red, high.red, accuracy: 1e-9)
    }

    func testHeatIntensityIsLogScaledAndBounded() {
        XCTAssertEqual(NoteDensityCell.intensity(0), 0)
        XCTAssertEqual(NoteDensityCell.intensity(100), 1, accuracy: 1e-9)
        XCTAssertEqual(NoteDensityCell.intensity(1_000), NoteDensityCell.intensity(100), "extreme counts remain bounded")
        XCTAssertGreaterThan(NoteDensityCell.intensity(1), 0.1, "a single note still shows")
        XCTAssertLessThan(NoteDensityCell.intensity(1), NoteDensityCell.intensity(10))
    }
    func testMapGroupReadingRequiresPhysicalProximityAndFreshAccurateFix() {
        let now = Date()
        let group = MapNoteGroup(id: "post:one", lat: 41, lng: 29, count: 10, radius: 0, postIDs: [])
        let near = LocationSample(latitude: 41, longitude: 29, accuracy: 6, timestamp: now)
        XCTAssertTrue(group.isNear(near, unlockRadius: 15, now: now))
        XCTAssertFalse(group.isNear(nil, unlockRadius: 15, now: now))
        XCTAssertFalse(group.isNear(near, unlockRadius: 15, now: now.addingTimeInterval(11)))
        XCTAssertFalse(group.isNear(LocationSample(latitude: 41.001, longitude: 29, accuracy: 6, timestamp: now), unlockRadius: 15, now: now))
        XCTAssertFalse(group.isNear(LocationSample(latitude: 41, longitude: 29, accuracy: 60, timestamp: now), unlockRadius: 15, now: now))
        XCTAssertFalse(group.isNear(LocationSample(latitude: 41, longitude: 29, accuracy: 6, timestamp: now, simulated: true), unlockRadius: 15, now: now))
    }

    func testMapBadgesMergeNearbyPlacesWithoutSplittingTheirActualNotes() {
        let a = MapNoteGroup(id: "spot:a", lat: 41, lng: 29, count: 10, radius: 0, postIDs: [])
        let b = MapNoteGroup(id: "spot:b", lat: 41, lng: 29.0003, count: 3, radius: 0, postIDs: [])
        let c = MapNoteGroup(id: "spot:c", lat: 41, lng: 29.02, count: 2, radius: 0, postIDs: [])
        let far = MapNoteCluster.cluster([a, b, c], longitudeSpan: 0.01, viewportWidth: 390, centerLongitude: 29)
        XCTAssertEqual(far.map(\.count), [13, 2])
        XCTAssertEqual(far[0].groups.map(\.id), ["spot:a", "spot:b"])
        let near = MapNoteCluster.cluster([a, b], longitudeSpan: 0.0005, viewportWidth: 390, centerLongitude: 29)
        XCTAssertEqual(near.map(\.count), [10, 3], "zooming reveals each real place; ten notes stay one place")
    }

    func testSidePanelResolvesSmallGroupByMembershipWhenNearestNoteIsNotItsAnchor() {
        let group = MapNoteGroup(id: "post:first", lat: 41, lng: 29, count: 2, radius: 12, postIDs: ["first", "nearest"])
        XCTAssertEqual(MapNoteGroup.containing("nearest", groupID: "post:nearest", in: [group]), group)
        XCTAssertNil(MapNoteGroup.containing("missing", groupID: "post:missing", in: [group]))
    }

}

final class DenseSpotTests: XCTestCase {
    func testLockedRowsDecodeTheirSpotAndBestFixPrefersFreshARCamera() throws {
        let json = #"{"id":"spot-1","count":34,"lat":41.0,"lng":29.0,"unlock_radius_m":15}"#
        let spot = try JSONDecoder().decode(DenseSpotInfo.self, from: Data(json.utf8))
        XCTAssertEqual(spot.count, 34); XCTAssertEqual(spot.unlockRadius, 15)
        let now = Date()
        let gps = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 41, longitude: 29), altitude: 0, horizontalAccuracy: 12, verticalAccuracy: -1, timestamp: now)
        let ar = LocationSample(latitude: 41, longitude: 29, accuracy: 2, timestamp: now)
        XCTAssertEqual(DenseSpotClient.bestFix(gps: gps, camera: ar, now: now)?.accuracy, 2)
        let staleAR = LocationSample(latitude: 41, longitude: 29, accuracy: 2, timestamp: now.addingTimeInterval(-5))
        XCTAssertEqual(DenseSpotClient.bestFix(gps: gps, camera: staleAR, now: now)?.accuracy, 12)
        XCTAssertNil(DenseSpotClient.bestFix(gps: nil, camera: nil, now: now))
    }
}

final class CampaignJourneyTests: XCTestCase {
    private let metre = 1 / 111_320.0
    private func fix(north: Double, east: Double = 0, accuracy: Double = 8) -> CLLocation {
        CLLocation(coordinate: CLLocationCoordinate2D(latitude: 41 + north * metre, longitude: 29 + east * metre / cos(41 * .pi / 180)),
                   altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1, timestamp: Date())
    }

    func testStreetAndCircleZonesMatchTheServerRule() throws {
        let street = CampaignZone.street(points: [.init(lat: 41, lng: 29), .init(lat: 41, lng: 29 + 200 * metre / cos(41 * .pi / 180))], width: 20)
        XCTAssertTrue(street.isValid)
        XCTAssertTrue(street.contains(fix(north: 5, east: 100)))
        XCTAssertTrue(street.contains(fix(north: 15, east: 100)), "5 m past the edge with 8 m GPS")
        XCTAssertFalse(street.contains(fix(north: 40, east: 100)), "parallel street")
        XCTAssertTrue(street.clearlyExcludes(fix(north: 40, east: 100)))
        let circle = CampaignZone.circle(lat: 41, lng: 29, radius: 30)
        XCTAssertTrue(circle.contains(fix(north: 35)))
        XCTAssertFalse(circle.clearlyExcludes(fix(north: 35)), "uncertain is not clearly outside")
        let json = #"{"kind":"street","points":[{"lat":41,"lng":29},{"lat":41.001,"lng":29.001}],"width":20}"#
        XCTAssertEqual(try JSONDecoder().decode(CampaignZone.self, from: Data(json.utf8)), .street(points: [.init(lat: 41, lng: 29), .init(lat: 41.001, lng: 29.001)], width: 20))
    }

    func testStepRegionsDecodeAndLeaveStepsAreNotMonitored() throws {
        let future = Date().timeIntervalSince1970 * 1000 + 60_000
        let json = """
        [{"id":"123e4567-e89b-12d3-a456-426614174001","campaignId":"123e4567-e89b-12d3-a456-426614174000","stepId":"s1","trigger":"leave_usual_place","kind":"campaign_step","transition":"entry","lat":41,"lng":29,"radius":150,"area":{"lat":41,"lng":29,"radius":5000},"expiresAt":\(future)},
         {"id":"123e4567-e89b-12d3-a456-426614174002","campaignId":"123e4567-e89b-12d3-a456-426614174000","stepId":"s2","trigger":"dwell","kind":"campaign_step","transition":"entry","lat":41,"lng":29,"radius":200,"zone":{"kind":"circle","lat":41,"lng":29,"radius":30},"dwellSeconds":120,"expiresAt":\(future)}]
        """
        let regions = try JSONDecoder().decode([CampaignRegion].self, from: Data(json.utf8))
        XCTAssertTrue(regions.allSatisfy { $0.isUsable(at: Date()) })
        XCTAssertTrue(regions[0].isLeaveStep); XCTAssertEqual(regions[1].dwellSeconds, 120)
        let selected = CampaignRegion.nearest(regions, to: nil, at: Date())
        XCTAssertEqual(selected.count, 2); XCTAssertEqual(selected.last?.isLeaveStep, true, "kept but outside the monitored budget")
    }

    func testUsualPlaceNeedsThreeNightsAndStaysOnTheNightCluster() {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Europe/Istanbul")!
        let day0 = calendar.date(from: DateComponents(year: 2026, month: 10, day: 1))!
        var learner = UsualPlaceLearner()
        func visit(_ lat: Double, from: Double, to: Double, day: Int) -> UsualPlaceLearner.Visit {
            let base = day0.addingTimeInterval(Double(day) * 86_400)
            return .init(lat: lat, lng: 29, arrival: base.addingTimeInterval(from * 3_600), departure: base.addingTimeInterval(to * 3_600))
        }
        let now = day0.addingTimeInterval(5 * 86_400)
        // Office by day (09-18), home overnight (22:00 → 07:00 next day).
        for day in 0..<2 { learner.record(visit(41.01, from: 9, to: 18, day: day), now: now); learner.record(visit(41.0, from: 22, to: 31, day: day), now: now) }
        XCTAssertNil(learner.usualPlace(calendar: calendar), "two nights are not enough")
        learner.record(visit(41.0001, from: 23, to: 31, day: 2), now: now)
        let place = learner.usualPlace(calendar: calendar)
        XCTAssertEqual(place?.latitude ?? 0, 41.0, accuracy: 0.0002)
    }
}
