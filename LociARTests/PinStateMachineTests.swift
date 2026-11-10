import XCTest
import UIKit
@testable import LociAR

final class PinStateMachineTests: XCTestCase {
    @MainActor
    func testEngineStartupAndCleanupDoNotInitializeRealityKit() {
        let engine = ARPinningEngine()
        XCTAssertNil(engine.existingARView)
        XCTAssertNil(engine.currentCameraTransform)
        engine.stopSession()
        engine.unregisterARViewHost(UIView())
        XCTAssertNil(engine.existingARView, "Non-AR screens and cleanup must not compile Metal pipelines")
        XCTAssertEqual(engine.state, .idle)
    }

    @MainActor
    func testFirstARHostInitializesOneViewAndLaterHostsReuseIt() throws {
        let engine = ARPinningEngine()
        let first = UIView(), second = UIView()
        engine.registerARViewHost(first)
        let view = try XCTUnwrap(engine.existingARView)
        XCTAssertTrue(view.superview === first)
        XCTAssertTrue(view.session.delegate === engine)
        engine.registerARViewHost(second)
        XCTAssertTrue(engine.arView === view)
        XCTAssertTrue(view.superview === second)
        engine.unregisterARViewHost(first)
        XCTAssertTrue(view.superview === second)
        engine.unregisterARViewHost(second)
        XCTAssertNil(view.superview)
        engine.stopSession()
        XCTAssertTrue(engine.existingARView === view)
    }

    @MainActor
    func testUnderlyingHostUpdateCannotStealCameraFromPresentedHost() throws {
        let engine = ARPinningEngine()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        let underlying = UIView(frame: window.bounds)
        let presented = UIView(frame: window.bounds)
        window.addSubview(underlying)
        engine.registerARViewHost(underlying)
        window.addSubview(presented)
        engine.registerARViewHost(presented)
        let cameraView = try XCTUnwrap(engine.existingARView)
        XCTAssertTrue(cameraView.superview === presented)

        // SwiftUI updates the still-mounted parent as shared engine diagnostics change.
        engine.activateARViewHost(underlying)
        XCTAssertTrue(cameraView.superview === presented)
        engine.unregisterARViewHost(presented)
        presented.removeFromSuperview()
        XCTAssertTrue(cameraView.superview === underlying)
        engine.unregisterARViewHost(underlying)
        engine.stopSession()
    }

    @MainActor
    func testReattachedHostBecomesForegroundWithoutBeingStolenByOlderUpdates() throws {
        let engine = ARPinningEngine()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        let first = UIView(frame: window.bounds), second = UIView(frame: window.bounds)
        window.addSubview(first)
        window.addSubview(second)
        engine.registerARViewHost(first)
        engine.registerARViewHost(second)
        engine.arViewHostDidMoveToWindow(first)
        engine.activateARViewHost(second)
        XCTAssertTrue(engine.existingARView?.superview === first)
        engine.unregisterARViewHost(first)
        engine.unregisterARViewHost(second)
        engine.stopSession()
    }

    @MainActor
    func testDeferredRaycastFromOldRunCannotFailReplacementRun() async throws {
#if targetEnvironment(simulator)
        let engine = ARPinningEngine()
        defer { engine.stopSession() }
        engine.startSession()
        // Leave the previous run one retry from its deadline, with no native frame.
        engine.beginTrackedRaycastWhenReady(attempt: 119)
        engine.stopSession()
        engine.startSession()
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertEqual(engine.state, .scanning)
        XCTAssertTrue(engine.hasRecentCameraFrame)
#else
        throw XCTSkip("Deferred raycast isolation uses the simulator camera fixture.")
#endif
    }

    @MainActor
    func testLateGeoPoseCannotOverwriteReplacementPin() async throws {
#if targetEnvironment(simulator)
        let engine = ARPinningEngine()
        defer { engine.stopSession() }
        var firstOwner: UUID?
        let firstReady = await engine.prepareNewPinSession { firstOwner = $0 }
        XCTAssertTrue(firstReady)
        engine.offerApproximatePlacement()
        engine.placeApproximate()
        let firstPin = try XCTUnwrap(engine.currentAnchor?.id)

        var secondOwner: UUID?
        let secondReady = await engine.prepareNewPinSession { secondOwner = $0 }
        XCTAssertTrue(secondReady)
        engine.offerApproximatePlacement()
        engine.placeApproximate()
        let secondPin = try XCTUnwrap(engine.currentAnchor?.id)
        let pose = try XCTUnwrap(UITestFixtures.anchor.geoPose)
        XCTAssertNotEqual(firstPin, secondPin)
        XCTAssertFalse(engine.applyCapturedGeoPose(pose, to: firstPin, cameraOwner: try XCTUnwrap(firstOwner)))
        XCTAssertFalse(engine.applyCapturedGeoPose(pose, to: secondPin, cameraOwner: try XCTUnwrap(firstOwner)))
        XCTAssertTrue(engine.applyCapturedGeoPose(pose, to: secondPin, cameraOwner: try XCTUnwrap(secondOwner)))
        XCTAssertEqual(engine.currentAnchor?.geoPose, pose)
#else
        throw XCTSkip("Delayed placement completion uses the simulator camera fixture.")
#endif
    }

    @MainActor
    func testCancelledCameraPreparationDoesNotStartOrFailAnotherSession() async {
        let engine = ARPinningEngine()
        let task = Task { @MainActor in await engine.prepareNewPinSession() }
        task.cancel()
        let ready = await task.value
        XCTAssertFalse(ready)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertNil(engine.existingARView)
    }

    @MainActor
    func testStaleCameraOwnerCannotStopNewerSession() async throws {
#if targetEnvironment(simulator)
        let engine = ARPinningEngine()
        var firstOwner: UUID?
        let firstReady = await engine.prepareNewPinSession { firstOwner = $0 }
        XCTAssertTrue(firstReady)
        var secondOwner: UUID?
        let secondReady = await engine.ensureLiveCameraSession { secondOwner = $0 }
        XCTAssertTrue(secondReady)
        XCTAssertNotEqual(firstOwner, secondOwner)
        engine.stopSession(ifGenerationMatches: firstOwner)
        XCTAssertTrue(engine.hasRecentCameraFrame)
        XCTAssertEqual(engine.state, .scanning)
        // A retry restarts ARKit, but ownership still belongs to the same foreground screen.
        engine.restartTracking()
        engine.stopSession(ifGenerationMatches: secondOwner)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertFalse(engine.hasRecentCameraFrame)
#else
        throw XCTSkip("Camera owner handoff without hardware runs in the simulator fixture.")
#endif
    }

    @MainActor
    func testCancelledViewerResolverCannotPauseReplacementCamera() async throws {
#if targetEnvironment(simulator)
        let engine = ARPinningEngine()
        let oldOwner = engine.claimCameraSession()
        let gate = AsyncStream<Void>.makeStream()
        let resolver = Task { @MainActor in
            defer { engine.stopSession(ifGenerationMatches: oldOwner) }
            for await _ in gate.stream { break }
        }
        var replacement: UUID?
        let ready = await engine.prepareNewPinSession { replacement = $0 }
        XCTAssertTrue(ready)
        resolver.cancel()
        gate.continuation.finish()
        await resolver.value
        XCTAssertTrue(engine.ownsCameraSession(replacement))
        XCTAssertTrue(engine.hasRecentCameraFrame)
        XCTAssertEqual(engine.state, .scanning)
        XCTAssertNil(engine.resetCameraSession(ifGenerationMatches: oldOwner))
        engine.stopSession(ifGenerationMatches: replacement)
#else
        throw XCTSkip("Resolver handoff uses the simulator camera fixture.")
#endif
    }

    @MainActor
    func testCancelledWorldMapRestoreFailsClosedBeforeNativeDecode() async {
        let engine = ARPinningEngine()
        let owner = engine.claimCameraSession()
        let resolver = Task { @MainActor in
            do {
                try await engine.restoreWorldMap(data: Data([0, 1, 2]), expectedAnchor: nil)
                return false
            } catch is CancellationError {
                return true
            } catch {
                return false
            }
        }
        resolver.cancel()
        let wasCancelled = await resolver.value
        XCTAssertTrue(wasCancelled)
        XCTAssertTrue(engine.ownsCameraSession(owner))
        XCTAssertEqual(engine.state, .idle)
        XCTAssertNil(engine.existingARView)
    }

    func testPhysicalPinPath() {
        let path: [PinSessionState] = [.idle, .initializing, .coaching, .scanning, .candidateReady, .placing, .placed, .mapping, .publishReady]
        for pair in zip(path, path.dropFirst()) {
            XCTAssertTrue(pair.0.canTransition(to: pair.1), "\(pair.0) should transition to \(pair.1)")
        }
    }

    func testApproximateRequiresOfferState() {
        XCTAssertFalse(PinSessionState.scanning.canTransition(to: .placed))
        XCTAssertTrue(PinSessionState.scanning.canTransition(to: .approximateOffered))
        XCTAssertTrue(PinSessionState.approximateOffered.canTransition(to: .placed))
    }

    func testFailedWorldMapSaveCanFallBackToApproximate() {
        // CreatePostView offers "Yaklaşık olarak devam et" after saveWorldMap fails in .mapping/.placed.
        XCTAssertTrue(PinSessionState.mapping.canTransition(to: .approximateOffered))
        XCTAssertTrue(PinSessionState.placed.canTransition(to: .approximateOffered))
        XCTAssertFalse(PinSessionState.publishReady.canTransition(to: .approximateOffered))
    }

    func testRelocalizedContentPath() {
        XCTAssertTrue(PinSessionState.placed.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.scanning.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.candidateReady.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.placing.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.approximateOffered.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.mapping.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.relocalizing.canTransition(to: .resolved))
        XCTAssertFalse(PinSessionState.failed.canTransition(to: .scanning))
        XCTAssertTrue(PinSessionState.failed.canTransition(to: .initializing))
        XCTAssertTrue(PinSessionState.resolved.canTransition(to: .resolved))
    }

    func testWorldLockedContentDoesNotRequireVisualPatternMatch() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("LociAR.xcodeproj").path) else {
            throw XCTSkip("Bu kaynak denetimi Mac üzerindeki dosya sistemini gerektirir.")
        }
        let engineSource = try? String(
            contentsOf: root.appendingPathComponent("LociAR/ARCore/ARPinningEngine.swift"),
            encoding: .utf8
        )
        let viewerSource = try? String(
            contentsOf: root.appendingPathComponent("LociAR/Features/AR/ARPostViewerView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(engineSource?.contains("revealIfSurfaceReady") == true)
        XCTAssertTrue(engineSource?.contains("beginAimAssistedReveal") == true)
        XCTAssertTrue(viewerSource?.contains("ar-aim-guidance") == true)
        XCTAssertFalse(viewerSource?.contains("Yüzeye bağla") == true)
        XCTAssertFalse(viewerSource?.contains("Bu yüzeye bağla") == true)
        // Multi-user world-map relocalization is attempted first, but a failed or timed-out
        // relocalization falls back to aim-assisted reveal while location access remains valid.
        // (Each stage first checks for cancellation, so closing the viewer stops the chain.)
        let openingSource = viewerSource?.components(separatedBy: "private func verifyAndOpen()").last
        let fallback = openingSource?.range(of: "if await relocalizeFromWorldMap() { return }")
        let reveal = openingSource?.range(of: "await revealWithAimGuidance()")
        XCTAssertNotNil(fallback)
        XCTAssertNotNil(reveal)
        if let fallback, let reveal { XCTAssertLessThan(fallback.lowerBound, reveal.lowerBound) }
    }
}
