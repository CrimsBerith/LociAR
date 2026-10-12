import CoreLocation
import XCTest
@testable import LociAR

final class LocationNoteTests: XCTestCase {
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

    func testEntryRuleMatchesServerRule() {
        XCTAssertTrue(LocationNotePolicy.fixInsideNote(distance: 25, accuracy: 8, radius: 20))
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 30, accuracy: 5, radius: 20))
        XCTAssertTrue(LocationNotePolicy.fixInsideNote(distance: 39, accuracy: 30, radius: 20), "tolerance capped at 20 m")
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 41, accuracy: 30, radius: 20))
        XCTAssertFalse(LocationNotePolicy.fixInsideNote(distance: 0, accuracy: 36, radius: 20), "fixes worse than 35 m never count")
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

    func testNotesKeepUpToFifteenOfTheTwentyMonitoredRegions() {
        let campaigns = (0..<18).map { i in CampaignRegion(id: UUID(), lat: 41 + Double(i) / 1000, lng: 29, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000) }
        let notes = (0..<18).map { i in
            CampaignRegion(id: UUID(), lat: 41 + Double(i) / 1000, lng: 29.001, radius: 150, expiresAt: now.timeIntervalSince1970 * 1000 + 60_000,
                           transition: "entry", kind: "place_note", triggerRadius: 20, notes: [NoteTarget(lat: 41 + Double(i) / 1000, lng: 29.001, r: 20)])
        }
        let selected = CampaignRegion.nearest(campaigns + notes, to: CLLocationCoordinate2D(latitude: 41, longitude: 29), at: now)
        XCTAssertEqual(selected.count, 20)
        XCTAssertEqual(selected.filter(\.isPlaceNote).count, 15)
        XCTAssertEqual(CampaignRegion.nearest(campaigns, to: nil, at: now).count, 18, "campaigns use every slot when there are no notes")
    }
}

final class NoteMapLayerTests: XCTestCase {
    func testZoomPicksHeatCountsOrNotes() {
        XCTAssertEqual(NoteMapLayer.forWidth(120_000), .heat(precision: 4))
        XCTAssertEqual(NoteMapLayer.forWidth(20_000), .heat(precision: 5))
        XCTAssertEqual(NoteMapLayer.forWidth(2_000), .heat(precision: 6))
        XCTAssertEqual(NoteMapLayer.forWidth(600), .counts)
        XCTAssertEqual(NoteMapLayer.forWidth(200), .notes)
        XCTAssertNil(NoteMapLayer.notes.precision)
        XCTAssertEqual(NoteMapLayer.counts.precision, 7)
    }

    func testHeatIntensityIsLogScaledAndBounded() {
        XCTAssertEqual(NoteDensityCell.intensity(0, max: 10), 0)
        XCTAssertEqual(NoteDensityCell.intensity(10, max: 10), 1, accuracy: 1e-9)
        XCTAssertGreaterThan(NoteDensityCell.intensity(1, max: 100), 0.1, "a single note still shows")
        XCTAssertLessThan(NoteDensityCell.intensity(1, max: 100), NoteDensityCell.intensity(10, max: 100))
    }
}

final class DenseSpotTests: XCTestCase {
    func testLockedRowsDecodeTheirSpotAndBestFixPrefersFreshARCamera() throws {
        let json = #"{"cell":"sxk973m4","count":34,"lat":41.0,"lng":29.0,"unlock_radius_m":15}"#
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
