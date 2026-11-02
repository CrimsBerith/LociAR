import XCTest
@testable import LociAR

@MainActor
final class ClientRequestCacheTests: XCTestCase {
    private final class Clock { var time = 0.0 }
    @MainActor private final class Network {
        var requests = 0
        var replies: [CheckedContinuation<Data, Error>] = []
        var watchers: [(Int, CheckedContinuation<Void, Never>)] = []
        func load() async throws -> Data {
            requests += 1
            return try await withCheckedThrowingContinuation { continuation in
                replies.append(continuation)
                let ready = watchers.filter { requests >= $0.0 }
                watchers.removeAll { requests >= $0.0 }; ready.forEach { $0.1.resume() }
            }
        }
        func wait(_ count: Int) async {
            if requests >= count { return }
            await withCheckedContinuation { watchers.append((count, $0)) }
        }
        func finish(_ index: Int, value: Data = Data([1])) { replies[index].resume(returning: value) }
    }

    func testParallelIdenticalLoadsShareOneRequestAndCancelledWaiterDoesNotCancelOthers() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 4, maxBytes: 32), network = Network()
        let first = Task { try await cache.value(for: "same", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1)
        let second = Task { try await cache.value(for: "same", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await Task.yield(); first.cancel(); network.finish(0)
        do { _ = try await first.value; XCTFail("cancelled waiter returned a result") } catch is CancellationError {} catch { XCTFail("\(error)") }
        let result = try await second.value
        XCTAssertEqual(result, Data([1])); XCTAssertEqual(network.requests, 1)
    }

    func testByteLRUEvictionAndHitsDoNotExtendExpiry() async throws {
        let clock = Clock(), cache = ClientRequestCache<Data>(maxEntries: 3, maxBytes: 6, now: { clock.time })
        for key in ["a", "b"] { _ = try await cache.value(for: key, ttl: 10, cost: { $0.count }) { Data([1, 2, 3]) } }
        clock.time = 9
        XCTAssertNotNil(cache.cachedValue(for: "a"))
        _ = try await cache.value(for: "c", ttl: 10, cost: { $0.count }) { Data([1, 2, 3]) }
        XCTAssertNil(cache.cachedValue(for: "b")); XCTAssertEqual(cache.byteCount, 6)
        clock.time = 10
        XCTAssertNil(cache.cachedValue(for: "a")); XCTAssertEqual(cache.byteCount, 3)
    }

    func testClearRejectsLateOldSessionResultWithoutRemovingNewFlight() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 4, maxBytes: 32), network = Network()
        let old = Task { try await cache.value(for: "same", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1); cache.clear()
        let new = Task { try await cache.value(for: "same", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(2); network.finish(0)
        do { _ = try await old.value; XCTFail("old session result survived") } catch is CancellationError {} catch { XCTFail("\(error)") }
        XCTAssertNil(cache.cachedValue(for: "same"))
        network.finish(1, value: Data([2]))
        let value = try await new.value
        XCTAssertEqual(value, Data([2])); XCTAssertEqual(cache.cachedValue(for: "same"), Data([2]))
    }

    func testRapidAccountAtoBtoAStillInvalidatesOldBytesAndAuthorizationGeneration() async throws {
        let a = UUID(), b = UUID(), network = Network()
        ClientReadCaches.setViewer(a)
        defer { ClientReadCaches.setViewer(nil) }
        let generation = ClientReadCaches.generation
        let old = Task { try await ClientReadCaches.avatars.value(for: "same-path", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1)
        ClientReadCaches.setViewer(b); ClientReadCaches.setViewer(a)
        XCTAssertNotEqual(ClientReadCaches.generation, generation)
        network.finish(0)
        do { _ = try await old.value; XCTFail("old account generation returned bytes") } catch is CancellationError {} catch { XCTFail("\(error)") }
        XCTAssertNil(ClientReadCaches.avatars.cachedValue(for: "same-path"))
    }

    func testDistinctRequestsWaitForCapacityInsteadOfFailingOrStartingUnboundedWork() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 4, maxBytes: 32, maxPending: 1), network = Network()
        let first = Task { try await cache.value(for: "a", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1)
        let second = Task { try await cache.value(for: "b", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await Task.yield(); XCTAssertEqual(network.requests, 1)
        network.finish(0); _ = try await first.value
        await network.wait(2); network.finish(1); _ = try await second.value
        XCTAssertEqual(network.requests, 2)
    }

    func testQueuedSameKeyWaitersJoinAfterCapacityOpens() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 4, maxBytes: 32, maxPending: 1), network = Network()
        let first = Task { try await cache.value(for: "a", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1)
        let second = Task { try await cache.value(for: "b", ttl: 60, cost: { $0.count }) { try await network.load() } }
        let third = Task { try await cache.value(for: "b", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await Task.yield(); network.finish(0); _ = try await first.value
        await network.wait(2); network.finish(1)
        _ = try await second.value; _ = try await third.value
        XCTAssertEqual(network.requests, 2, "waiting requests must share the newly available flight")
    }

    func testCancelledCapacityWaiterDoesNotWaitForAnUnrelatedNetworkRequest() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 4, maxBytes: 32, maxPending: 1), network = Network()
        let first = Task { try await cache.value(for: "a", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await network.wait(1)
        let queued = Task { try await cache.value(for: "b", ttl: 60, cost: { $0.count }) { try await network.load() } }
        await Task.yield(); queued.cancel()
        do { _ = try await queued.value; XCTFail("cancelled capacity waiter survived") } catch is CancellationError {} catch { XCTFail("\(error)") }
        XCTAssertEqual(network.requests, 1)
        network.finish(0); _ = try await first.value
    }

    func testFailureIsNotCachedAndOversizedValuesAreNotRetained() async throws {
        let cache = ClientRequestCache<Data>(maxEntries: 2, maxBytes: 2)
        do { _ = try await cache.value(for: "a", ttl: 60, cost: { $0.count }) { throw URLError(.notConnectedToInternet) }; XCTFail("expected failure") } catch {}
        let value = try await cache.value(for: "a", ttl: 60, cost: { $0.count }) { Data([1, 2, 3]) }
        XCTAssertEqual(value.count, 3); XCTAssertEqual(cache.byteCount, 0); XCTAssertNil(cache.cachedValue(for: "a"))
    }

    func testDailyViewReceiptSkipsRepeatWithoutReturningAnOldAuthoritativeCount() async throws {
        ClientReadCaches.clear()
        let user = UUID(), post = UUID(), date = Date(timeIntervalSince1970: 200_000)
        let first = try await ClientReadCaches.recordView(owner: user, post: post, date: date) { 17 }
        let repeatResult = try await ClientReadCaches.recordView(owner: user, post: post, date: date) { XCTFail("repeat server call"); return 18 }
        let nextDay = try await ClientReadCaches.recordView(owner: user, post: post, date: date.addingTimeInterval(86_400)) { 19 }
        let otherUser = try await ClientReadCaches.recordView(owner: UUID(), post: post, date: date) { 20 }
        XCTAssertEqual(first, 17); XCTAssertNil(repeatResult); XCTAssertEqual(nextDay, 19); XCTAssertEqual(otherUser, 20)
        ClientReadCaches.clear()
    }

    func testScreenRefreshCoalescesTwentyTriggersAndReusesOnlyFreshPresentation() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        let first = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
        for _ in 0..<20 { XCTAssertNil(gate.begin(scope: "viewer|feed", revision: revision, force: true)) }
        gate.finish(first, succeeded: true)
        clock.time = 59
        XCTAssertNil(gate.begin(scope: "viewer|feed", revision: revision))
        XCTAssertEqual(gate.nextDelay, 5)
        clock.time = 60
        XCTAssertNotNil(gate.begin(scope: "viewer|feed", revision: revision))
    }

    func testCompletedManualRefreshCannotBeRepeatedOnEveryTap() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        var calls = 0
        for second in 0...20 {
            clock.time = Double(second)
            if let ticket = gate.begin(scope: "viewer|feed", revision: revision, force: true) {
                calls += 1; gate.finish(ticket, succeeded: true)
            }
        }
        XCTAssertEqual(calls, 5, "one initial request and at most one per five seconds even if every tap finishes immediately")
    }

    func testContentChangeRejectsOldFlightAndQueuesOneFreshRead() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), oldRevision = UUID(), newRevision = UUID()
        let old = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: oldRevision))
        gate.prepare(scope: "viewer|feed", revision: newRevision)
        XCTAssertFalse(gate.isCurrent(old, scope: "viewer|feed", revision: oldRevision))
        XCTAssertNil(gate.begin(scope: "viewer|feed", revision: newRevision))
        gate.finish(old, succeeded: true)
        clock.time = 5
        XCTAssertNotNil(gate.begin(scope: "viewer|feed", revision: newRevision), "late old response must not make the new revision fresh")
    }

    func testOldViewerCompletionCannotClearNewViewerFlight() throws {
        let gate = ScreenRefreshGate(), revision = UUID()
        let old = try XCTUnwrap(gate.begin(scope: "old-user|comments", revision: revision))
        let current = try XCTUnwrap(gate.begin(scope: "new-user|comments", revision: revision))
        gate.finish(old, succeeded: true)
        XCTAssertTrue(gate.isCurrent(current, scope: "new-user|comments", revision: revision))
        XCTAssertFalse(gate.isCurrent(old, scope: "old-user|comments", revision: revision))
    }

    func testReadRetriesBackOffWithoutCachingAnError() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        for delay in [15.0, 30, 60, 120] {
            let ticket = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
            gate.finish(ticket, succeeded: false, error: URLError(.notConnectedToInternet))
            XCTAssertEqual(gate.nextDelay, delay)
            clock.time += delay - 1
            XCTAssertNil(gate.begin(scope: "viewer|feed", revision: revision, force: true))
            clock.time += 1
        }
        let recovered = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
        gate.finish(recovered, succeeded: true)
        XCTAssertEqual(gate.nextDelay, 60)
    }

    func testPermissionFailureStopsAutomaticReadsButNewContentRevisionCanRevalidate() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        let ticket = try XCTUnwrap(gate.begin(scope: "viewer|profile", revision: revision))
        gate.finish(ticket, succeeded: false, error: BackendCallError.rejected(code: 7, message: "Denied", reason: nil))
        clock.time = 1_000
        XCTAssertNil(gate.begin(scope: "viewer|profile", revision: revision))
        XCTAssertNotNil(gate.begin(scope: "viewer|profile", revision: UUID()))
    }

    func testRateLimitWaitsAtLeastAMinuteAndCancellationDoesNotCreateAnErrorBackoff() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        let ticket = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
        gate.finish(ticket, succeeded: false, error: BackendCallError.rejected(code: 8, message: "Rate limited", reason: "rate_limited"))
        clock.time = 59
        XCTAssertNil(gate.begin(scope: "viewer|feed", revision: revision, force: true))
        clock.time = 60
        let retry = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
        gate.finish(retry, succeeded: false, error: CancellationError())
        clock.time = 65
        let afterCancellation = try XCTUnwrap(gate.begin(scope: "viewer|feed", revision: revision))
        gate.finish(afterCancellation, succeeded: false, error: BackendCallError.rejected(code: 8, message: "Query too dense", reason: nil))
        clock.time = 1_000
        XCTAssertNil(gate.begin(scope: "viewer|feed", revision: revision), "unknown resource failures must not repeat an expensive query automatically")
    }

    func testActivityPushDoesNotInvalidateUnrelatedFeedButContentChangesInvalidateBoth() {
        let updates = ContentUpdates(), feed = updates.revision, activity = updates.activityRevision
        updates.activityChanged()
        XCTAssertEqual(updates.revision, feed); XCTAssertNotEqual(updates.activityRevision, activity)
        let nextActivity = updates.activityRevision
        updates.changed()
        XCTAssertNotEqual(updates.revision, feed); XCTAssertNotEqual(updates.activityRevision, nextActivity)
    }

    func testGifSearchIdentityIgnoresWhitespaceAndTextBeyondTheServerLimit() {
        XCTAssertEqual(GifSearchQuery.normalized("  cats\n"), "cats")
        XCTAssertEqual(GifSearchQuery.normalized(String(repeating: "a", count: 50) + "b"), String(repeating: "a", count: 50))
    }


    func testNetworkRecoveryWakesReadsWithoutBypassingAServerRateLimit() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), revision = UUID()
        let first = try XCTUnwrap(gate.begin(scope: "viewer", revision: revision))
        XCTAssertFalse(gate.connectionRestored(), "do not cancel a still-running request on a connectivity event")
        gate.finish(first, succeeded: false, error: URLError(.notConnectedToInternet))
        clock.time = 5
        XCTAssertTrue(gate.connectionRestored())
        let recovered = try XCTUnwrap(gate.begin(scope: "viewer", revision: revision))
        gate.finish(recovered, succeeded: false, error: BackendCallError.rejected(code: 8, message: "Rate limited", reason: "rate_limited"))
        clock.time = 10
        XCTAssertFalse(gate.connectionRestored())
        XCTAssertNil(gate.begin(scope: "viewer", revision: revision, force: true))
    }


    func testLatePermissionErrorCannotBlockANewerContentRevision() throws {
        let clock = Clock(), gate = ScreenRefreshGate(now: { clock.time }), oldRevision = UUID(), latest = UUID()
        let old = try XCTUnwrap(gate.begin(scope: "viewer|comments", revision: oldRevision))
        gate.prepare(scope: "viewer|comments", revision: latest)
        gate.finish(old, succeeded: false, error: BackendCallError.rejected(code: 7, message: "Old denial", reason: nil))
        clock.time = 5
        XCTAssertNotNil(gate.begin(scope: "viewer|comments", revision: latest))
    }

}
