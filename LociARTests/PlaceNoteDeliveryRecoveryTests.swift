import XCTest
@testable import LociAR

@MainActor
final class PlaceNoteDeliveryRecoveryTests: XCTestCase {
    private func waitUntil(_ predicate: () -> Bool) async {
        let deadline = Date().addingTimeInterval(2)
        while !predicate(), Date() < deadline { await Task.yield() }
        XCTAssertTrue(predicate(), "asynchronous work did not reach its checkpoint")
    }

    func testBlockedAcknowledgementDoesNotBlockRegionWorkOrStartADuplicateBatch() async {
        let pump = PlaceNoteAcknowledgementPump(), id = UUID()
        var gate: CheckedContinuation<Void, Never>?, calls = 0
        pump.schedule([id]) { _ in
            calls += 1
            await withCheckedContinuation { gate = $0 }
            return true
        }
        // This is the same synchronous scheduling boundary used by synchronize().
        var regionsRefreshed = false
        regionsRefreshed = true
        await waitUntil { gate != nil }
        XCTAssertTrue(regionsRefreshed)
        pump.schedule([id]) { _ in calls += 1; return true }
        XCTAssertEqual(calls, 1)
        gate?.resume(); gate = nil
        await waitUntil { !pump.isRunning }
    }

    func testFailuresCoolDownWithoutStarvingNewAcknowledgementsAndBatchesStayBounded() async {
        var now = Date(), calls: [UUID] = []
        let pump = PlaceNoteAcknowledgementPump(clock: { now })
        let ids = (0..<5).map { _ in UUID() }
        pump.schedule(ids) { id in calls.append(id); return false }
        await waitUntil { !pump.isRunning }
        XCTAssertEqual(calls, Array(ids.prefix(3)))
        pump.schedule(ids) { id in calls.append(id); return true }
        await waitUntil { !pump.isRunning }
        XCTAssertEqual(calls, ids, "failed old IDs must not starve newer ACKs")
        now = now.addingTimeInterval(60)
        pump.schedule(Array(ids.prefix(3))) { id in calls.append(id); return true }
        await waitUntil { !pump.isRunning }
        XCTAssertEqual(calls, ids + Array(ids.prefix(3)))
    }

    func testAccountOrConsentCancellationStopsOldBatchEvenWhenNetworkCompletesLate() async {
        let pump = PlaceNoteAcknowledgementPump()
        let oldIDs = [UUID(), UUID()], newID = UUID()
        var gate: CheckedContinuation<Void, Never>?, calls: [UUID] = []
        pump.schedule(oldIDs) { id in
            calls.append(id)
            await withCheckedContinuation { gate = $0 }
            return true
        }
        await waitUntil { gate != nil }
        pump.cancel()
        pump.schedule([newID]) { id in calls.append(id); return true }
        await waitUntil { !pump.isRunning }
        gate?.resume(); gate = nil
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(calls, [oldIDs[0], newID])
        XCTAssertFalse(pump.isRunning)
    }

    func testExpirySeparatesOldCachedRegionsFromStillRecoverableAttempts() {
        let now = Date(), old = UUID(), active = UUID(), future = UUID()
        let attempts = [old: PlaceNoteDeliveryAttempt(deliveryID: UUID(), createdAt: now.addingTimeInterval(-86_400)),
                        active: PlaceNoteDeliveryAttempt(deliveryID: UUID(), createdAt: now.addingTimeInterval(-86_399)),
                        future: PlaceNoteDeliveryAttempt(deliveryID: UUID(), createdAt: now.addingTimeInterval(11))]
        XCTAssertEqual(PlaceNoteDeliveryAttempt.expiredRegions(in: attempts, at: now), [old, future])
        XCTAssertEqual(PlaceNoteDeliveryAttempt.retryLifetime, 86_400)
    }
}
